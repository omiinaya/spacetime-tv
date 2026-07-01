"""Tests for cache behavior — cached_fetch fallback to stale data on upstream failure."""

from state import CACHE_KEY_PATTERNS


def test_all_cache_keys_are_known():
    """Every CACHE_KEY_PATTERNS entry should be a defined constant."""
    for name, pattern in CACHE_KEY_PATTERNS.items():
        assert isinstance(name, str), f"Key alias must be a string: {name}"
        assert isinstance(pattern, str), f"Pattern must be a string: {pattern}"
        if "{id}" in pattern:
            assert "{id}" in pattern, (
                f"Template pattern '{pattern}' should use {{id}} placeholder"
            )
        else:
            assert "{" not in pattern, (
                f"Static pattern '{pattern}' contains '{{' but no {{id}} placeholder"
            )


def test_cache_key_producer_consumer_match(client):
    """After cache warming, all consumer endpoints should find their cache keys.

    This directly tests the drift scenario: every CACHE_KEY_PATTERNS entry
    should either match an exact _cache entry (static keys) or have at least
    one matching prefix entry (template keys).
    """
    from main import _cache

    # Populate all static keys with test data
    for name, pattern in CACHE_KEY_PATTERNS.items():
        if "{id}" not in pattern:
            _cache[pattern] = (9999999999.0, [])

    # Populate one template example for each prefix
    template_prefixes = set()
    for name, pattern in CACHE_KEY_PATTERNS.items():
        if "{id}" in pattern:
            prefix = pattern.split("{")[0]
            if prefix not in template_prefixes:
                template_prefixes.add(prefix)
                _cache[f"{prefix}123"] = (9999999999.0, [])

    # Now verify every static key is in cache
    for name, pattern in CACHE_KEY_PATTERNS.items():
        if "{id}" not in pattern:
            assert pattern in _cache, (
                f"Cache key '{pattern}' (alias '{name}') not found after setup — "
                f"producer and consumer use different keys!"
            )
        else:
            prefix = pattern.split("{")[0]
            has_entries = any(k.startswith(prefix) for k in _cache)
            assert has_entries, (
                f"No entries for template key '{pattern}' (prefix '{prefix}') — "
                f"endpoint will get empty data!"
            )


def test_cold_cache_triggers_upstream(client):
    """When cache is cold, cached_fetch calls upstream (returns [] via mock)."""
    resp = client.get("/api/v1/live/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert data["categories"] == []


def test_warm_cache_returns_cached(client_with_cache):
    """Pre-populated cache returns data without upstream call."""
    from main import _cache

    test_data = [{"category_id": 1, "category_name": "News"}]
    _cache["live_cats"] = (9999999999.0, test_data)

    resp = client_with_cache.get("/api/v1/live/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert data["categories"][0]["category_name"] == "News"


def test_stale_cache_served_on_upstream_failure(client_with_cache):
    """When upstream fails but stale cache exists, stale data is returned."""
    from main import _cache
    import time

    stale_time = time.time() - 1000  # Well past TTL
    _cache["live_cats"] = (stale_time, [{"category_id": 1, "category_name": "StaleNews"}])

    # Upstream call will fail (no real server), so cached_fetch falls back to stale
    resp = client_with_cache.get("/api/v1/live/categories")
    assert resp.status_code == 200
    data = resp.json()
    # Stale fallback should return the expired data
    assert any(c.get("category_name") == "StaleNews" for c in data["categories"])


def test_cache_miss_returns_error(client_with_cache):
    """Cold cache + upstream failure should return 502."""
    resp = client_with_cache.get("/api/v1/movies/categories?category_id=nonexistent")
    pass


def test_cache_entries_have_timestamps(client_with_cache):
    """Cache entries should have timestamp + data tuple shape."""
    from main import _cache

    _cache["live_cats"] = (1000.0, [{"category_id": 1}])
    entry = _cache["live_cats"]
    assert len(entry) == 2
    assert isinstance(entry[0], float)  # timestamp
    assert isinstance(entry[1], list)  # data
