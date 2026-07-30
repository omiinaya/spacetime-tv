"""Comprehensive tests for watchlist routes.

Covers all endpoints in routes/watchlist.py:
- GET  /api/v1/watchlist
- POST /api/v1/watchlist/sync-progress
- GET  /api/v1/watchlist/progress
- POST /api/v1/watchlist/profile/sync-progress
- GET  /api/v1/watchlist/profile/progress
"""

import time

# ── GET /api/v1/watchlist ────────────────────────────────────────────────


def test_get_watchlist_returns_empty_structure(client):
    """GET /api/v1/watchlist returns an empty watchlist structure."""
    resp = client.get("/api/v1/watchlist")
    assert resp.status_code == 200
    data = resp.json()
    assert "watchlist" in data
    assert data["watchlist"] == {}


# ── POST /api/v1/watchlist/sync-progress ─────────────────────────────────


def test_sync_progress_missing_fields_returns_400(client):
    """POST /api/v1/watchlist/sync-progress with missing fields returns 400."""
    # Empty body
    resp = client.post("/api/v1/watchlist/sync-progress", json={})
    assert resp.status_code == 400

    # Missing position
    resp = client.post("/api/v1/watchlist/sync-progress", json={"watchKey": "vod_123"})
    assert resp.status_code == 400

    # Missing watchKey
    resp = client.post("/api/v1/watchlist/sync-progress", json={"position": 42.5})
    assert resp.status_code == 400


def test_sync_progress_valid_entry_stores_and_returns_ok(client):
    """POST /api/v1/watchlist/sync-progress with valid fields persists entry."""
    resp = client.post(
        "/api/v1/watchlist/sync-progress",
        json={
            "watchKey": "vod_42",
            "position": 120.5,
            "timestamp": 1000000,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["synced"] is True

    from state import _progress_store

    assert "vod_42" in _progress_store
    assert _progress_store["vod_42"][0]["position"] == 120.5


def test_sync_progress_default_timestamp_when_omitted(client):
    """POST /api/v1/watchlist/sync-progress fills in current time if no timestamp."""
    resp = client.post(
        "/api/v1/watchlist/sync-progress",
        json={"watchKey": "vod_t0", "position": 0.0},
    )
    assert resp.status_code == 200

    from state import _progress_store

    entry = _progress_store["vod_t0"][0]
    assert "timestamp" in entry
    # Should be a recent-ish timestamp
    assert abs(entry["timestamp"] - time.time()) < 5


def test_sync_progress_strips_null_series_data(client):
    """POST /api/v1/watchlist/sync-progress omits seriesData when null."""
    resp = client.post(
        "/api/v1/watchlist/sync-progress",
        json={
            "watchKey": "vod_null_series",
            "position": 10.0,
            "seriesData": None,
        },
    )
    assert resp.status_code == 200

    from state import _progress_store

    entry = _progress_store["vod_null_series"][0]
    assert "seriesData" not in entry


def test_sync_progress_strips_null_movie_data(client):
    """POST /api/v1/watchlist/sync-progress omits movieData when null."""
    resp = client.post(
        "/api/v1/watchlist/sync-progress",
        json={
            "watchKey": "vod_null_movie",
            "position": 20.0,
            "movieData": None,
        },
    )
    assert resp.status_code == 200

    from state import _progress_store

    entry = _progress_store["vod_null_movie"][0]
    assert "movieData" not in entry


def test_sync_progress_strips_none_series_and_movie_data(client):
    """POST /api/v1/watchlist/sync-progress omits both seriesData and movieData when None."""
    resp = client.post(
        "/api/v1/watchlist/sync-progress",
        json={
            "watchKey": "vod_no_data",
            "position": 30.0,
            "seriesData": None,
            "movieData": None,
        },
    )
    assert resp.status_code == 200

    from state import _progress_store

    entry = _progress_store["vod_no_data"][0]
    assert "seriesData" not in entry
    assert "movieData" not in entry


# ── GET /api/v1/watchlist/progress ───────────────────────────────────────


def test_get_progress_returns_empty_when_no_data(client):
    """GET /api/v1/watchlist/progress returns empty dict when no progress synced."""
    resp = client.get("/api/v1/watchlist/progress")
    assert resp.status_code == 200
    data = resp.json()
    assert data["progress"] == {}


def test_get_progress_returns_synced_entries(client):
    """GET /api/v1/watchlist/progress returns entries after sync."""
    client.post(
        "/api/v1/watchlist/sync-progress",
        json={"watchKey": "vod_10", "position": 50.0, "timestamp": 1000000},
    )
    client.post(
        "/api/v1/watchlist/sync-progress",
        json={
            "watchKey": "ep_1",
            "position": 200.0,
            "timestamp": 2000000,
            "seriesData": {"seriesName": "Test"},
        },
    )

    resp = client.get("/api/v1/watchlist/progress")
    assert resp.status_code == 200
    data = resp.json()
    assert "vod_10" in data["progress"]
    assert "ep_1" in data["progress"]
    assert data["progress"]["vod_10"][0]["position"] == 50.0
    assert data["progress"]["ep_1"][0]["position"] == 200.0


# ── POST /api/v1/watchlist/profile/sync-progress ─────────────────────────


def test_profile_sync_progress_without_token_falls_back_to_global(client):
    """POST /api/v1/watchlist/profile/sync-progress without X-Profile-Token stores globally."""
    resp = client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={"watchKey": "vod_fallback", "position": 77.0, "timestamp": 3000000},
        headers={},  # no X-Profile-Token
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data.get("synced") is True  # global fallback response

    from state import _progress_store

    assert "vod_fallback" in _progress_store
    assert _progress_store["vod_fallback"][0]["position"] == 77.0


def test_profile_sync_progress_with_invalid_token_returns_401(client):
    """POST /api/v1/watchlist/profile/sync-progress with bad token returns 401."""
    resp = client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={"watchKey": "vod_bad", "position": 10.0},
        headers={"X-Profile-Token": "invalid-token"},
    )
    assert resp.status_code == 401


def test_profile_sync_progress_missing_fields_returns_400(client):
    """POST /api/v1/watchlist/profile/sync-progress validates required fields."""
    # Need to create a valid profile first to get past the token check
    from auth import create_profile, generate_profile_token

    profile = create_profile("Test User", "1234", "default")
    pid = profile["profile_id"]
    token = generate_profile_token(pid)

    # Missing watchKey and position
    resp = client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={},
        headers={"X-Profile-Token": token},
    )
    assert resp.status_code == 400

    # Missing position
    resp = client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={"watchKey": "vod_missing_pos"},
        headers={"X-Profile-Token": token},
    )
    assert resp.status_code == 400

    # Missing watchKey
    resp = client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={"position": 15.0},
        headers={"X-Profile-Token": token},
    )
    assert resp.status_code == 400


def test_profile_sync_progress_with_valid_token_stores_progress(client):
    """POST /api/v1/watchlist/profile/sync-progress stores progress per profile."""
    from auth import _load_profiles, create_profile, generate_profile_token

    profile = create_profile("Alice", "9999", "alice.png")
    pid = profile["profile_id"]
    token = generate_profile_token(pid)

    resp = client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={
            "watchKey": "vod_profile_1",
            "position": 300.5,
            "timestamp": 4000000,
        },
        headers={"X-Profile-Token": token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["profile_id"] == pid

    # Verify in loaded profiles
    profiles = _load_profiles()
    assert pid in profiles
    assert "progress" in profiles[pid]
    assert profiles[pid]["progress"]["vod_profile_1"]["position"] == 300.5


def test_profile_sync_progress_updates_existing_watch_key(client):
    """POST /api/v1/watchlist/profile/sync-progress updates a previously stored watch key."""
    from auth import _load_profiles, create_profile, generate_profile_token

    profile = create_profile("Bob", "1111")
    pid = profile["profile_id"]
    token = generate_profile_token(pid)

    # First sync
    client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={
            "watchKey": "vod_same",
            "position": 100.0,
            "timestamp": 5000000,
        },
        headers={"X-Profile-Token": token},
    )

    # Second sync — same watchKey, new position
    client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={
            "watchKey": "vod_same",
            "position": 200.0,
            "timestamp": 6000000,
        },
        headers={"X-Profile-Token": token},
    )

    profiles = _load_profiles()
    assert profiles[pid]["progress"]["vod_same"]["position"] == 200.0


def test_profile_sync_progress_strips_null_metadata(client):
    """POST /api/v1/watchlist/profile/sync-progress strips null seriesData/movieData."""
    from auth import _load_profiles, create_profile, generate_profile_token

    profile = create_profile("Charlie", "2222")
    pid = profile["profile_id"]
    token = generate_profile_token(pid)

    resp = client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={
            "watchKey": "vod_strip",
            "position": 42.0,
            "seriesData": None,
            "movieData": None,
        },
        headers={"X-Profile-Token": token},
    )
    assert resp.status_code == 200

    profiles = _load_profiles()
    entry = profiles[pid]["progress"]["vod_strip"]
    assert "seriesData" not in entry
    assert "movieData" not in entry


def test_profile_sync_progress_with_non_existent_profile_returns_404(client):
    """POST /api/v1/watchlist/profile/sync-progress with invalid profile_id returns 404."""
    from auth import generate_profile_token

    # Generate a token for a profile_id that doesn't exist
    token = generate_profile_token("nonexistent0000")

    resp = client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={"watchKey": "vod_ghost", "position": 5.0},
        headers={"X-Profile-Token": token},
    )
    assert resp.status_code == 404


# ── GET /api/v1/watchlist/profile/progress ────────────────────────────────


def test_profile_get_progress_without_token_falls_back_to_global(client):
    """GET /api/v1/watchlist/profile/progress without token returns global progress."""
    # Seed global progress
    client.post(
        "/api/v1/watchlist/sync-progress",
        json={"watchKey": "global_key", "position": 88.0, "timestamp": 7000000},
    )

    resp = client.get(
        "/api/v1/watchlist/profile/progress",
        headers={},  # no X-Profile-Token
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "progress" in data
    assert "global_key" in data["progress"]


def test_profile_get_progress_with_invalid_token_returns_401(client):
    """GET /api/v1/watchlist/profile/progress with bad token returns 401."""
    resp = client.get(
        "/api/v1/watchlist/profile/progress",
        headers={"X-Profile-Token": "totally-fake-token"},
    )
    assert resp.status_code == 401


def test_profile_get_progress_returns_empty_when_no_progress(client):
    """GET /api/v1/watchlist/profile/progress returns empty dict when no progress stored."""
    from auth import create_profile, generate_profile_token

    profile = create_profile("Diana", "3333")
    pid = profile["profile_id"]
    token = generate_profile_token(pid)

    resp = client.get(
        "/api/v1/watchlist/profile/progress",
        headers={"X-Profile-Token": token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["progress"] == {}


def test_profile_get_progress_returns_stored_entries(client):
    """GET /api/v1/watchlist/profile/progress returns previously synced progress."""
    from auth import create_profile, generate_profile_token

    profile = create_profile("Eve", "4444")
    pid = profile["profile_id"]
    token = generate_profile_token(pid)

    # Sync two entries
    client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={
            "watchKey": "vod_alice_1",
            "position": 150.0,
            "timestamp": 8000000,
            "movieData": {"movieName": "Alpha"},
        },
        headers={"X-Profile-Token": token},
    )
    client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={
            "watchKey": "vod_alice_2",
            "position": 250.0,
            "timestamp": 9000000,
            "seriesData": {"seriesName": "Beta"},
        },
        headers={"X-Profile-Token": token},
    )

    resp = client.get(
        "/api/v1/watchlist/profile/progress",
        headers={"X-Profile-Token": token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "vod_alice_1" in data["progress"]
    assert "vod_alice_2" in data["progress"]
    assert data["progress"]["vod_alice_1"]["position"] == 150.0
    assert data["progress"]["vod_alice_1"]["movieData"]["movieName"] == "Alpha"
    assert data["progress"]["vod_alice_2"]["position"] == 250.0
    assert data["progress"]["vod_alice_2"]["seriesData"]["seriesName"] == "Beta"


def test_profile_progress_isolation_between_profiles(client):
    """Progress for different profiles is isolated and does not leak."""
    from auth import create_profile, generate_profile_token

    alice = create_profile("Alice", "5555")
    bob = create_profile("Bob", "6666")
    alice_token = generate_profile_token(alice["profile_id"])
    bob_token = generate_profile_token(bob["profile_id"])

    # Alice syncs progress
    client.post(
        "/api/v1/watchlist/profile/sync-progress",
        json={
            "watchKey": "vod_alice_only",
            "position": 500.0,
            "timestamp": 10000000,
        },
        headers={"X-Profile-Token": alice_token},
    )

    # Bob's progress should be empty
    resp = client.get(
        "/api/v1/watchlist/profile/progress",
        headers={"X-Profile-Token": bob_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["progress"] == {}

    # Alice's progress should have her entry
    resp = client.get(
        "/api/v1/watchlist/profile/progress",
        headers={"X-Profile-Token": alice_token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "vod_alice_only" in data["progress"]
    assert data["progress"]["vod_alice_only"]["position"] == 500.0


def test_profile_get_progress_with_deleted_profile_returns_404(client):
    """GET /api/v1/watchlist/profile/progress returns 404 after profile deleted."""
    from auth import create_profile, delete_profile, generate_profile_token

    profile = create_profile("Frank", "7777")
    pid = profile["profile_id"]
    token = generate_profile_token(pid)

    # Delete the profile
    delete_profile(pid)

    resp = client.get(
        "/api/v1/watchlist/profile/progress",
        headers={"X-Profile-Token": token},
    )
    assert resp.status_code == 404
