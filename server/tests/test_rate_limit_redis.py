"""Tests for RedisRateLimitStore — optional distributed rate limiting (P2).

No live Redis required: a tiny in-process fake implements the subset of the
``redis.asyncio`` client surface the store uses (pipeline SET NX EX + INCR,
TTL) so the store's real logic — window keys, TTL-based Retry-After, shared
counters across "instances" — is exercised end-to-end.

Tests verify:
- limit N requests allowed, N+1 blocked (fixed window)
- blocked result carries Retry-After == remaining window TTL
- remaining quota reported correctly
- TWO store instances sharing one fake server share counters
  (the multi-instance property the memory store cannot provide)
- window expiry resets the counter (SET NX starts a fresh window)
- Redis outage fails OPEN (availability wins, warning logged once)
"""

import logging

import pytest

from rate_limit import RedisRateLimitStore


class _FakePipe:
    def __init__(self, server):
        self._server = server
        self._ops = []

    def set(self, k, v, nx=False, ex=None):
        self._ops.append(("set", k, v, nx, ex))
        return self

    def incr(self, k):
        self._ops.append(("incr", k))
        return self

    async def execute(self):
        results = []
        for op in self._ops:
            if op[0] == "set":
                _k, v, nx, ex = op[1], op[2], op[3], op[4]
                if nx and _k in self._server.data:
                    results.append(False)  # key exists → SET NX no-op
                else:
                    self._server.data[_k] = v
                    self._server.expire[_k] = ex if ex is not None else 0
                    results.append(True)
            else:  # incr
                _k = op[1]
                cur = int(self._server.data.get(_k, 0)) + 1
                self._server.data[_k] = cur
                results.append(cur)
        return results


class _FakeRedis:
    """In-process stand-in for redis.asyncio.Redis (pipeline + ttl only)."""

    def __init__(self):
        self.data = {}
        self.expire = {}

    def pipeline(self):
        return _FakePipe(self)

    async def ttl(self, k):
        if k not in self.data:
            return -2  # key missing (redis semantics)
        if self.expire.get(k, 0) <= 0:
            return -1  # no expiry
        return self.expire[k]


@pytest.fixture
def fake_server():
    return _FakeRedis()


@pytest.fixture
def store(fake_server):
    return RedisRateLimitStore(url="redis://fake:6379/0", prefix="stv:rl", client=fake_server)


@pytest.mark.asyncio
async def test_redis_allows_up_to_limit_then_blocks(fake_server, store):
    """Fixed window: limit=3 allows exactly 3, the 4th is rejected."""
    for i in range(3):
        r = await store.check_and_increment("ip-1", limit=3, window=60)
        assert r.allowed, "first 3 must be allowed"
        assert r.remaining == 3 - (i + 1)
    blocked = await store.check_and_increment("ip-1", limit=3, window=60)
    assert not blocked.allowed
    assert blocked.remaining == 0
    assert blocked.retry_after > 0


@pytest.mark.asyncio
async def test_redis_retry_after_matches_window_ttl(fake_server, store):
    """Blocked response reports the seconds until the window key expires."""
    for _ in range(3):
        await store.check_and_increment("ip-2", limit=3, window=60)
    blocked = await store.check_and_increment("ip-2", limit=3, window=60)
    assert not blocked.allowed
    # Key was created with ex=60; TTL still 60 in the fake (no clock advance).
    assert blocked.retry_after == 60


@pytest.mark.asyncio
async def test_redis_remaining_quota_reported(fake_server, store):
    r1 = await store.check_and_increment("ip-3", limit=5, window=60)
    assert r1.allowed and r1.remaining == 4
    r2 = await store.check_and_increment("ip-3", limit=5, window=60)
    assert r2.allowed and r2.remaining == 3


@pytest.mark.asyncio
async def test_redis_shared_across_store_instances(fake_server):
    """The multi-instance property: two stores over one Redis share counters.

    This is exactly what the in-memory store cannot do — two processes each
    with their own dict would each allow `limit` requests.
    """
    store_a = RedisRateLimitStore(url="redis://fake:6379/0", prefix="stv:rl", client=fake_server)
    store_b = RedisRateLimitStore(url="redis://fake:6379/0", prefix="stv:rl", client=fake_server)
    for _ in range(2):
        assert (await store_a.check_and_increment("ip-4", limit=3, window=60)).allowed
    # store_b sees store_a's count — only 1 slot left in the shared window.
    assert (await store_b.check_and_increment("ip-4", limit=3, window=60)).allowed
    assert not (await store_a.check_and_increment("ip-4", limit=3, window=60)).allowed


@pytest.mark.asyncio
async def test_redis_window_expiry_resets_counter(fake_server, store):
    """SET NX EX starts a fresh window; expiry lets requests through again."""
    for _ in range(3):
        await store.check_and_increment("ip-5", limit=3, window=60)
    assert not (await store.check_and_increment("ip-5", limit=3, window=60)).allowed
    # Simulate window lapse: drop the key (Redis TTL eviction).
    fake_server.data.clear()
    fake_server.expire.clear()
    assert (await store.check_and_increment("ip-5", limit=3, window=60)).allowed


@pytest.mark.asyncio
async def test_redis_per_key_isolation(fake_server, store):
    await store.check_and_increment("ip-a", limit=1, window=60)
    assert not (await store.check_and_increment("ip-a", limit=1, window=60)).allowed
    assert (await store.check_and_increment("ip-b", limit=1, window=60)).allowed


@pytest.mark.asyncio
async def test_redis_outage_fails_open(fake_server, store, caplog):
    """Redis down → requests pass (fail-open) and a warning is logged once."""
    fake_server.data = _ExplodingData()
    fake_server.expire = _ExplodingData()
    with caplog.at_level(logging.WARNING):
        r = await store.check_and_increment("ip-6", limit=3, window=60)
    assert r.allowed
    assert r.remaining == 3
    assert "failing OPEN" in caplog.text


@pytest.mark.asyncio
async def test_redis_outage_warns_once(fake_server, store, caplog):
    """Fail-open logs the outage warning ONCE per error class (rate_limit.py
    ``self._warned`` dedupe) — repeated degraded requests don't spam the log."""
    fake_server.data = _ExplodingData()
    fake_server.expire = _ExplodingData()
    with caplog.at_level(logging.WARNING):
        for _ in range(4):
            r = await store.check_and_increment("ip-7", limit=3, window=60)
            assert r.allowed  # every request still fails OPEN
    assert caplog.text.count("failing OPEN") == 1, "warning must be logged exactly once"


class _ExplodingData(dict):
    """dict subclass whose every access raises — simulates a dead connection."""

    def __getitem__(self, key):
        raise ConnectionError("connection refused")

    def get(self, key, default=None):
        raise ConnectionError("connection refused")

    def __contains__(self, key):
        raise ConnectionError("connection refused")
