"""Tests for EPG guide endpoints — /api/guide, /api/guide/now.

Pre-populates epg_cache with sample XMLTV-like data and _cache with
live stream mappings, then verifies response structure, filtering,
pagination, and edge cases.
"""

import time
from datetime import datetime, timedelta, timezone


def _epg_timestamp(dt=None):
    """Format a datetime to EPG XMLTV timestamp format: YYYYMMDDhhmmss +0000"""
    if dt is None:
        dt = datetime.now(timezone.utc)
    return dt.strftime("%Y%m%d%H%M%S") + " +0000"


def _make_sample_epg():
    """Build EPG data with programme times near 'now' so filtering doesn't drop them."""
    now = datetime.now(timezone.utc)
    epg_data = {
        "channels": [
            {"id": "BBC1.uk", "name": "BBC One", "icon": "http://example.com/bbc1.png"},
            {"id": "BBC2.uk", "name": "BBC Two", "icon": "http://example.com/bbc2.png"},
            {"id": "ITV1.uk", "name": "ITV 1", "icon": ""},
        ],
        "programmes": [
            {
                "channel": "BBC1.uk",
                "start": _epg_timestamp(now - timedelta(hours=1, minutes=30)),
                "stop": _epg_timestamp(now + timedelta(minutes=30)),
                "title": "Breakfast News",
                "subtitle": "",
                "desc": "Morning news programme",
                "icon": "",
                "category": "news",
            },
            {
                "channel": "BBC1.uk",
                "start": _epg_timestamp(now + timedelta(minutes=30)),
                "stop": _epg_timestamp(now + timedelta(hours=2)),
                "title": "Morning Live",
                "subtitle": "",
                "desc": "Magazine show",
                "icon": "",
                "category": "magazine",
            },
            {
                "channel": "BBC2.uk",
                "start": _epg_timestamp(now - timedelta(minutes=15)),
                "stop": _epg_timestamp(now + timedelta(hours=1)),
                "title": "Gardeners' World",
                "subtitle": "Summer Special",
                "desc": "Gardening programme",
                "icon": "",
                "category": "lifestyle",
            },
            {
                "channel": "ITV1.uk",
                "start": _epg_timestamp(now - timedelta(hours=2)),
                "stop": _epg_timestamp(now - timedelta(minutes=45)),
                "title": "Good Morning Britain",
                "subtitle": "",
                "desc": "Morning show",
                "icon": "",
                "category": "talk",
            },
        ],
    }
    return epg_data


def _setup_epg_cache(epg_cache):
    """Helper: populate epg_cache with sample data and recent timestamp."""
    epg_cache["data"] = _make_sample_epg()
    epg_cache["fetched"] = time.time()


def test_guide_returns_structure(client):
    """GET /api/guide should return the expected response shape."""
    from state import epg_cache
    _setup_epg_cache(epg_cache)

    resp = client.get("/api/v1/guide")
    assert resp.status_code == 200
    data = resp.json()

    assert "channel_groups" in data
    assert "total_channels" in data
    assert "offset" in data
    assert "limit" in data
    assert isinstance(data["channel_groups"], list)
    assert isinstance(data["total_channels"], int)
    assert data["total_channels"] >= 2  # at least 2 channels with programmes in range
    assert data["offset"] == 0
    assert data["limit"] == 60


def test_guide_channel_group_shape(client):
    """Each channel group should have the expected fields."""
    from state import epg_cache
    _setup_epg_cache(epg_cache)

    resp = client.get("/api/v1/guide")
    data = resp.json()
    assert len(data["channel_groups"]) > 0
    group = data["channel_groups"][0]

    assert "channel_id" in group
    assert "channel_name" in group
    assert "channel_icon" in group
    assert "stream_id" in group
    assert "programmes" in group
    assert isinstance(group["programmes"], list)


def test_guide_channel_filter(client):
    """GET /api/guide?channel=BBC1.uk should return only that channel."""
    from state import epg_cache
    _setup_epg_cache(epg_cache)

    resp = client.get("/api/v1/guide?channel=BBC1.uk")
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_channels"] == 1
    assert len(data["channel_groups"]) == 1
    assert data["channel_groups"][0]["channel_id"] == "BBC1.uk"
    # BBC1 has 2 programmes in sample data
    assert len(data["channel_groups"][0]["programmes"]) == 2


def test_guide_pagination(client):
    """Offset and limit should slice channel groups."""
    from state import epg_cache
    _setup_epg_cache(epg_cache)

    resp_all = client.get("/api/v1/guide")
    total = resp_all.json()["total_channels"]

    # limit=1 should return single group
    resp = client.get("/api/v1/guide?limit=1&offset=0")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["channel_groups"]) == 1
    assert data["total_channels"] == total
    assert data["limit"] == 1

    # offset=1 should skip first group (if total > 1)
    if total > 1:
        resp2 = client.get("/api/v1/guide?limit=1&offset=1")
        data2 = resp2.json()
        assert len(data2["channel_groups"]) == 1
        assert data2["channel_groups"][0]["channel_id"] != data["channel_groups"][0]["channel_id"]


def test_guide_programme_fields(client):
    """Each programme should have the expected fields including is_live flag."""
    from state import epg_cache
    _setup_epg_cache(epg_cache)

    resp = client.get("/api/v1/guide")
    data = resp.json()
    group = data["channel_groups"][0]
    prog = group["programmes"][0]

    assert "start" in prog
    assert "stop" in prog
    assert "title" in prog
    assert "subtitle" in prog
    assert "desc" in prog
    assert "category" in prog
    assert "is_live" in prog
    assert isinstance(prog["is_live"], bool)


def test_guide_empty_epg_recovers_gracefully(client):
    """When EPG has no data, guide should still return a valid response structure."""
    from state import epg_cache
    # Set empty cached EPG so no real fetch is attempted
    epg_cache["data"] = {"channels": [], "programmes": []}
    epg_cache["fetched"] = time.time()

    resp = client.get("/api/v1/guide")
    assert resp.status_code == 200
    data = resp.json()
    assert "channel_groups" in data
    assert "total_channels" in data
    assert isinstance(data["channel_groups"], list)
    assert data["total_channels"] == 0


def test_guide_now_returns_structure(client):
    """GET /api/guide/now should return programme lookups by stream_id."""
    from state import epg_cache
    _setup_epg_cache(epg_cache)

    resp = client.get("/api/v1/guide/now?stream_ids=1,2,3")
    assert resp.status_code == 200
    data = resp.json()
    assert "programmes" in data
    assert isinstance(data["programmes"], dict)


def test_guide_now_no_stream_ids(client):
    """GET /api/guide/now with empty stream_ids returns no programmes."""
    resp = client.get("/api/v1/guide/now?stream_ids=")
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"programmes": {}}


def test_guide_now_invalid_ids_ignored(client):
    """GET /api/guide/now should ignore non-numeric stream_id parts."""
    from state import epg_cache
    _setup_epg_cache(epg_cache)

    resp = client.get("/api/v1/guide/now?stream_ids=abc,def,xyz")
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"programmes": {}}


def test_guide_now_with_cache_mapping(client_with_cache):
    """When live_all cache has epg_channel_id mappings, /api/guide/now should resolve programmes."""
    from state import epg_cache
    from state import _cache
    _setup_epg_cache(epg_cache)

    # Pre-populate live_all with stream-to-EPG-channel mapping
    _cache["live_all"] = (time.time(), [
        {"stream_id": 101, "name": "BBC One HD", "epg_channel_id": "BBC1.uk", "stream_icon": "", "category_id": "1"},
        {"stream_id": 201, "name": "BBC Two HD", "epg_channel_id": "BBC2.uk", "stream_icon": "", "category_id": "1"},
    ])

    resp = client_with_cache.get("/api/v1/guide/now?stream_ids=101,201")
    assert resp.status_code == 200
    data = resp.json()
    programmes = data["programmes"]
    assert "101" in programmes
    assert "201" in programmes


def test_guide_now_unknown_stream_id_returns_null(client_with_cache):
    """Stream IDs not in live_all cache should return None for the programme."""
    from state import epg_cache
    _setup_epg_cache(epg_cache)

    resp = client_with_cache.get("/api/v1/guide/now?stream_ids=999")
    assert resp.status_code == 200
    data = resp.json()
    # 999 doesn't map to any EPG channel, so it should be None or empty
    assert "999" in data["programmes"]
    assert data["programmes"]["999"] is None


def test_guide_now_with_empty_epg_returns_unknown(client):
    """Even with empty EPG, /api/guide/now should return keys for queried IDs."""
    from unittest.mock import patch, AsyncMock
    import routes.guide_routes
    from routes.guide_epg import EPG_CACHE_FILE
    # Ensure the on-disk EPG cache is also cleared to force empty EPG
    if EPG_CACHE_FILE.exists():
        EPG_CACHE_FILE.unlink()
    # Mock EPG fetch to return empty data (prevents real HTTP calls that
    # fail with "Event loop is closed" when test ordering triggers asyncio issues)
    # Patch at usage site (guide_routes) not definition site (guide_epg)
    with patch.object(
        routes.guide_routes,
        "load_epg_background",
        new_callable=AsyncMock,
        return_value={"programmes": [], "channels": []},
    ):
        resp = client.get("/api/v1/guide/now?stream_ids=101,201")
    assert resp.status_code == 200
    data = resp.json()
    programmes = data["programmes"]
    assert "101" in programmes
    assert "201" in programmes
    # Without EPG data, the resolutions will be None
    assert programmes["101"] is None
    assert programmes["201"] is None
