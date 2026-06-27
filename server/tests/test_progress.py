"""Tests for /api/watchlist/sync-progress and /api/watchlist/progress endpoints."""


def test_sync_progress_missing_fields_returns_400(client):
    """POST /api/watchlist/sync-progress with missing fields returns 422/400."""
    # Empty body
    resp = client.post("/api/watchlist/sync-progress", json={})
    assert resp.status_code == 400

    # Missing position
    resp = client.post("/api/watchlist/sync-progress", json={"watchKey": "vod_123"})
    assert resp.status_code == 400

    # Missing watchKey
    resp = client.post("/api/watchlist/sync-progress", json={"position": 42.5})
    assert resp.status_code == 400


def test_sync_progress_persists_entry(client):
    """POST /api/watchlist/sync-progress stores the entry and returns ok."""
    resp = client.post("/api/watchlist/sync-progress", json={
        "watchKey": "vod_42",
        "position": 120.5,
        "timestamp": 1000000,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["synced"] is True

    # Check it was stored in the module-level progress store
    import main as m
    assert "vod_42" in m._progress_store
    assert m._progress_store["vod_42"][0]["position"] == 120.5


def test_sync_progress_keeps_only_last_5_per_key(client):
    """POST /api/watchlist/sync-progress retains at most 5 entries per key."""
    for i in range(10):
        resp = client.post("/api/watchlist/sync-progress", json={
            "watchKey": "vod_99",
            "position": float(i * 10),
            "timestamp": 2000000 + i,
        })
        assert resp.status_code == 200

    import main as m
    assert len(m._progress_store["vod_99"]) == 5
    # Most recent entries first (highest timestamp)
    assert m._progress_store["vod_99"][0]["position"] == 90.0
    assert m._progress_store["vod_99"][4]["position"] == 50.0


def test_sync_progress_with_series_metadata(client):
    """POST /api/watchlist/sync-progress stores series metadata."""
    resp = client.post("/api/watchlist/sync-progress", json={
        "watchKey": "ep_1_2",
        "position": 300.0,
        "timestamp": 3000000,
        "seriesData": {
            "seriesId": 1,
            "seriesName": "Test Series",
            "cover": "http://example.com/cover.jpg",
            "seasonNumber": 1,
            "episodeNum": 2,
            "episodeId": "ep2",
            "episodeTitle": "Test Episode",
            "durationSeconds": 3600,
        },
    })
    assert resp.status_code == 200

    import main as m
    entry = m._progress_store["ep_1_2"][0]
    assert entry["seriesData"]["seriesName"] == "Test Series"
    assert entry["seriesData"]["episodeNum"] == 2


def test_sync_progress_with_movie_metadata(client):
    """POST /api/watchlist/sync-progress stores movie metadata."""
    resp = client.post("/api/watchlist/sync-progress", json={
        "watchKey": "vod_100",
        "position": 500.0,
        "timestamp": 4000000,
        "movieData": {
            "movieId": 100,
            "movieName": "Test Movie",
            "poster": "http://example.com/poster.jpg",
            "durationSeconds": 7200,
        },
    })
    assert resp.status_code == 200

    import main as m
    entry = m._progress_store["vod_100"][0]
    assert entry["movieData"]["movieName"] == "Test Movie"


def test_get_progress_returns_empty_when_no_data(client):
    """GET /api/watchlist/progress returns empty dict when no progress synced."""
    resp = client.get("/api/watchlist/progress")
    assert resp.status_code == 200
    data = resp.json()
    assert data["progress"] == {}


def test_get_progress_returns_stored_entries(client):
    """GET /api/watchlist/progress returns entries previously synced."""
    # Sync two entries
    client.post("/api/watchlist/sync-progress", json={
        "watchKey": "vod_42",
        "position": 120.5,
        "timestamp": 1000000,
    })
    client.post("/api/watchlist/sync-progress", json={
        "watchKey": "ep_1_2",
        "position": 300.0,
        "timestamp": 2000000,
        "seriesData": {"seriesId": 1, "seriesName": "Test"},
    })

    resp = client.get("/api/watchlist/progress")
    assert resp.status_code == 200
    data = resp.json()

    assert "vod_42" in data["progress"]
    assert "ep_1_2" in data["progress"]
    assert data["progress"]["vod_42"][0]["position"] == 120.5
    assert data["progress"]["ep_1_2"][0]["position"] == 300.0
    assert data["progress"]["ep_1_2"][0]["seriesData"]["seriesName"] == "Test"
