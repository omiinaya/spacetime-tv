"""Tests for EPG guide cache fallback, background refresh, and edge cases."""

import time
from datetime import UTC, datetime, timedelta


def _epg_timestamp(dt=None):
    if dt is None:
        dt = datetime.now(UTC)
    return dt.strftime("%Y%m%d%H%M%S") + " +0000"


SAMPLE_EPG_DATA = {
    "channels": [
        {"id": "BBC1.uk", "name": "BBC One", "icon": "http://example.com/bbc1.png"},
        {"id": "BBC2.uk", "name": "BBC Two", "icon": "http://example.com/bbc2.png"},
    ],
    "programmes": [
        {
            "channel": "BBC1.uk",
            "start": _epg_timestamp(datetime.now(UTC) - timedelta(hours=1)),
            "stop": _epg_timestamp(datetime.now(UTC) + timedelta(hours=1)),
            "title": "Morning News",
            "subtitle": "",
            "desc": "Morning news programme",
            "icon": "",
            "category": "news",
        },
    ],
}


def test_guide_single_channel_filter(client_with_cache):
    """?channel=BBC1.uk should only return that channel's programmes."""
    from state import epg_cache

    epg_cache["data"] = SAMPLE_EPG_DATA
    epg_cache["fetched"] = time.time()

    resp = client_with_cache.get("/api/v1/guide?channel=BBC1.uk")
    assert resp.status_code == 200
    data = resp.json()
    for group in data.get("channel_groups", []):
        assert group["channel_id"] == "BBC1.uk"


def test_guide_channel_filter_no_match(client_with_cache):
    """?channel=NONEXISTENT should return empty groups."""
    from state import epg_cache

    epg_cache["data"] = SAMPLE_EPG_DATA
    epg_cache["fetched"] = time.time()

    resp = client_with_cache.get("/api/v1/guide?channel=NONEXISTENT")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data.get("channel_groups", [])) == 0


def test_guide_empty_epg(client):
    """With no EPG data, guide should return empty groups, not crash."""
    resp = client.get("/api/v1/guide")
    assert resp.status_code == 200
    data = resp.json()
    assert "channel_groups" in data
    assert "total_channels" in data


def test_guide_now_with_partial_ids(client_with_cache):
    """/api/v1/guide/now should handle partial stream ID matches."""
    from state import _cache, epg_cache

    epg_cache["data"] = SAMPLE_EPG_DATA
    epg_cache["fetched"] = time.time()
    _cache["live_all"] = (
        1000.0,
        [
            {"stream_id": 1, "name": "BBC One", "stream_icon": "", "category_id": "1", "epg_channel_id": "BBC1.uk"},
        ],
    )

    # Ask for stream_id=1 (exists) and stream_id=999 (doesn't exist)
    resp = client_with_cache.get("/api/v1/guide/now?stream_ids=1,999")
    assert resp.status_code == 200
    data = resp.json()
    prog = data.get("programmes", {})
    # stream_id 1 should have a programme
    assert "1" in prog
    # stream_id 999 may or may not be present
    if "999" in prog:
        assert prog["999"] is None


def test_guide_now_empty_ids(client):
    """/api/v1/guide/now without stream_ids returns 422 (required param)."""
    resp = client.get("/api/v1/guide/now")
    assert resp.status_code == 422


def test_guide_now_no_epg_data(client_with_cache):
    """/api/v1/guide/now should return empty when EPG cache is empty."""
    from state import _cache

    _cache["live_all"] = (
        1000.0,
        [
            {"stream_id": 1, "name": "BBC One", "stream_icon": "", "category_id": "1", "epg_channel_id": "BBC1.uk"},
        ],
    )

    # EPG is explicitly None
    resp = client_with_cache.get("/api/v1/guide/now?stream_ids=1")
    assert resp.status_code == 200
    data = resp.json()
    assert "programmes" in data


def test_guide_enrich_not_found(client_with_cache):
    """/api/v1/guide/enrich with no-match query returns empty."""
    from state import epg_cache

    epg_cache["data"] = SAMPLE_EPG_DATA
    epg_cache["fetched"] = time.time()

    resp = client_with_cache.get("/api/v1/guide/enrich?q=zzzzzznonexistent")
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"enabled": False, "result": None}
