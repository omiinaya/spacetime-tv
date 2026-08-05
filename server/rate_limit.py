"""Rate-limit stores for Spacetime-TV (P2: distributed rate limiting).

The historical limiter is an in-process fixed-window counter keyed by
device-token / IP (see ``main.RateLimitMiddleware``). For multi-instance
deployments that counter is per-process, so N replicas each allow N× the
intended traffic and a client can rotate instances to dodge the cap.

This module adds an optional **Redis-backed** fixed-window store. When
``REDIS_URL`` is configured the middleware shares one counter across all
replicas (window keys expire on the server — no local eviction sweep
needed, so it is memory-bounded by design). Without ``REDIS_URL`` the
in-memory store in ``main`` remains the default: single-user LAN keeps
zero new dependencies and zero config.

Failure semantics: the Redis store degrades **fail-open** — if Redis is
down/unreachable the request is allowed and a warning is logged once per
error class, so the app never 429s the whole site because the shared
limiter vanished. Rate limiting is best-effort; availability wins.

The Redis fixed-window algorithm is intentionally simple and race-tolerant
(SET NX EX + INCR in one pipeline — the same fixed-window approximation
the in-memory store already makes):

    pipe.set(key, 0, nx=True, ex=window)   # start a fresh window if absent
    pipe.incr(key)                          # count this request
    -> count > limit means blocked
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

log = logging.getLogger("spacetime-tv")


@dataclass(frozen=True)
class RateLimitResult:
    """Outcome of a rate-limit check for one request.

    ``allowed`` False means the caller should respond 429 with
    ``retry_after`` seconds until the window lapses.
    """

    allowed: bool
    remaining: int
    retry_after: int


class RedisRateLimitStore:
    """Fixed-window rate limiting shared across processes via Redis.

    Keys: ``{prefix}:{bucket_key}`` where bucket_key is the device token
    or client IP. TTL == window, so Redis evicts stale buckets by itself.

    Args:
        url: redis:// connection URL (redis.asyncio.from_url).
        prefix: key namespace; set per-app so multiple services on one
            Redis instance never share counters.
        client: injected client (tests). When None the store lazily
            creates a real ``redis.asyncio`` client on first use.
    """

    def __init__(self, url: str, prefix: str = "stv:rl", client: Any | None = None):
        self._url = url
        self._prefix = prefix
        self._client_obj = client
        self._warned: set[str] = set()

    async def _client(self) -> Any:
        if self._client_obj is None:
            import redis.asyncio as aioredis

            self._client_obj = aioredis.from_url(self._url)
        return self._client_obj

    async def check_and_increment(
        self,
        key: str,
        limit: int,
        window: int,
        now: float | None = None,
    ) -> RateLimitResult:
        del now  # Redis owns the clock; kept for interface parity with the memory store
        try:
            client = await self._client()
            redis_key = f"{self._prefix}:{key}"
            pipe = client.pipeline()
            pipe.set(redis_key, 0, nx=True, ex=window)
            pipe.incr(redis_key)
            _set_ok, count = await pipe.execute()
            count = int(count)
            if count > limit:
                # Retry-After: seconds until the window key expires.
                ttl = await client.ttl(redis_key)
                retry_after = max(1, int(ttl)) if isinstance(ttl, int) and ttl > 0 else 1
                return RateLimitResult(allowed=False, remaining=0, retry_after=retry_after)
            return RateLimitResult(allowed=True, remaining=max(0, limit - count), retry_after=0)
        except Exception as exc:  # noqa: BLE001 — fail-open on Redis outage
            exc_name = type(exc).__name__
            if exc_name not in self._warned:
                self._warned.add(exc_name)
                log.warning(
                    "Redis rate-limit store error (%s) — failing OPEN for this "
                    "request; rate limiting degraded to per-instance memory. "
                    "Check REDIS_URL / server reachability.",
                    exc,
                )
            return RateLimitResult(allowed=True, remaining=limit, retry_after=0)
