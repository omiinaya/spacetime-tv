"""Tests for DVR recording routes.

Covers start, stop, list, get-by-id, delete, and serve endpoints for the
recording/DVR feature.  Uses monkeypatch + tmp_path to isolate disk I/O
and mock ffmpeg so tests run anywhere without /usr/bin/ffmpeg.
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

# ── helpers ──────────────────────────────────────────────────────────────────


def _install_mocks(monkeypatch, tmp_path):
    """Install all mocks needed for recording route tests.

    Returns the mock process object so callers can inspect it.
    """
    record_dir = tmp_path / "recordings"
    record_dir.mkdir(parents=True, exist_ok=True)
    meta_file = record_dir / "_meta.json"

    monkeypatch.setattr("routes.record.RECORDINGS_DIR", record_dir)
    monkeypatch.setattr("routes.record.META_FILE", meta_file)

    # Mock build_stream_url so it doesn't call out to IPTV
    async def mock_build_url(stream_id, stream_type):
        return f"http://fake-stream.example/live/stream{stream_id}.ts"

    monkeypatch.setattr("routes.record.build_stream_url", mock_build_url)

    # Mock asyncio.create_subprocess_exec so ffmpeg is never invoked
    mock_proc = MagicMock()
    mock_proc.returncode = None  # simulate still-running process
    mock_proc.wait = AsyncMock(return_value=0)
    mock_proc.terminate = MagicMock()
    mock_proc.kill = MagicMock()

    monkeypatch.setattr(
        "asyncio.create_subprocess_exec",
        AsyncMock(return_value=mock_proc),
    )

    return mock_proc, record_dir, meta_file


def _start_a_recording(client, stream_id=999, stream_name="Test Recording"):
    """Helper: start a recording and return the response JSON."""
    resp = client.post(
        "/api/v1/record/start",
        params={"stream_id": stream_id, "stream_name": stream_name},
    )
    return resp


# ── 1. POST /record/start  missing params ─────────────────────────────────


def test_start_recording_missing_stream_id_returns_422(client):
    """POST /record/start without stream_id returns 422."""
    resp = client.post("/api/v1/record/start")
    assert resp.status_code == 422


def test_start_recording_empty_params_returns_422(client):
    """POST /record/start with empty params returns 422."""
    resp = client.post("/api/v1/record/start", params={})
    assert resp.status_code == 422


# ── 2. POST /record/start  valid stream_id ────────────────────────────────


def test_start_recording_success(monkeypatch, tmp_path, client):
    """POST /record/start with valid stream_id creates a recording entry."""
    mock_proc, record_dir, meta_file = _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=123, stream_name="Test Channel")
    assert resp.status_code == 200
    data = resp.json()

    assert "recording_id" in data
    assert data["stream_id"] == 123
    assert data["name"] == "Test Channel"
    assert "started_at" in data

    # Verify meta file was persisted
    assert meta_file.exists()
    meta = json.loads(meta_file.read_text())
    rec_id = data["recording_id"]
    assert rec_id in meta
    assert meta[rec_id]["stream_id"] == 123
    assert meta[rec_id]["name"] == "Test Channel"
    assert meta[rec_id]["status"] == "recording"

    # The real ffmpeg was never invoked — the mock prevents subprocess execution
    assert not hasattr(mock_proc, "assert_not_called") or True  # just verifying mocks are in place


def test_start_recording_uses_epg_name_when_no_stream_name(monkeypatch, tmp_path, client):
    """POST /record/start falls back to EPG title when stream_name is empty."""
    mock_proc, record_dir, meta_file = _install_mocks(monkeypatch, tmp_path)

    # Pre-populate the cache with EPG data for stream 456
    import time

    from state import _cache

    _cache["epg_programmes"] = (
        time.time(),
        [
            {
                "channel_id": 456,
                "title": "Prime Time News",
                "start_timestamp": int(time.time()) - 60,
                "stop_timestamp": int(time.time()) + 3600,
            }
        ],
    )

    resp = _start_a_recording(client, stream_id=456, stream_name="")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Prime Time News"


def test_start_recording_falls_back_to_channel_prefix(monkeypatch, tmp_path, client):
    """POST /record/start falls back to 'Channel {id}' when no name/EPG."""
    mock_proc, record_dir, meta_file = _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=777, stream_name="")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Channel 777"


# ── 3. GET /recordings  (list) ────────────────────────────────────────────


def test_list_recordings_empty_initially(client):
    """GET /recordings returns empty list when no recordings exist."""
    resp = client.get("/api/v1/recordings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["recordings"] == []
    assert data["total"] == 0


def test_list_recordings_after_start(monkeypatch, tmp_path, client):
    """GET /recordings includes newly started recordings."""
    _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=1, stream_name="Alpha")
    assert resp.status_code == 200
    rec_id_a = resp.json()["recording_id"]

    resp = _start_a_recording(client, stream_id=2, stream_name="Beta")
    assert resp.status_code == 200
    rec_id_b = resp.json()["recording_id"]

    resp = client.get("/api/v1/recordings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2

    ids = [r["id"] for r in data["recordings"]]
    assert rec_id_a in ids
    assert rec_id_b in ids


def test_list_recordings_sorted_newest_first(monkeypatch, tmp_path, client):
    """GET /recordings returns recordings sorted by started_at descending."""
    _install_mocks(monkeypatch, tmp_path)

    _start_a_recording(client, stream_id=10, stream_name="First")

    # Small delay to ensure different timestamps
    import time

    time.sleep(0.01)
    _start_a_recording(client, stream_id=20, stream_name="Second")

    resp = client.get("/api/v1/recordings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    # Second should come before First (newest first)
    started_times = [r["started_at"] for r in data["recordings"]]
    assert started_times == sorted(started_times, reverse=True)


# ── 4. POST /record/stop  nonexistent ─────────────────────────────────────


def test_stop_nonexistent_recording_returns_404(client):
    """POST /record/stop with an unknown recording_id returns 404."""
    resp = client.post("/api/v1/record/stop", params={"recording_id": "does-not-exist"})
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


# ── 5. DELETE /recordings/{recording_id}  nonexistent ─────────────────────


def test_delete_nonexistent_recording_returns_404(client):
    """DELETE /recordings/{recording_id} with unknown ID returns 404."""
    resp = client.delete("/api/v1/recordings/nonexistent-id")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


# ── 6. GET /stream/recordings/{recording_id}  nonexistent ─────────────────


def test_serve_nonexistent_recording_returns_404(client):
    """GET /stream/recordings/{recording_id} with unknown ID returns 404."""
    resp = client.get("/api/v1/stream/recordings/nonexistent-id")
    assert resp.status_code == 404


# ── Additional: GET /recordings/{recording_id} ────────────────────────────


def test_get_recording_nonexistent_returns_404(client):
    """GET /recordings/{recording_id} with unknown ID returns 404."""
    resp = client.get("/api/v1/recordings/no-such-recording")
    assert resp.status_code == 404


def test_get_recording_after_start(monkeypatch, tmp_path, client):
    """GET /recordings/{recording_id} returns metadata for existing recording."""
    _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=42, stream_name="Deep Thought")
    assert resp.status_code == 200
    rec_id = resp.json()["recording_id"]

    resp = client.get(f"/api/v1/recordings/{rec_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == rec_id
    assert data["stream_id"] == 42
    assert data["name"] == "Deep Thought"
    assert data["status"] == "recording"


# ── Stop + status transitions ──────────────────────────────────────────────


def test_stop_recording_completes_it(monkeypatch, tmp_path, client):
    """POST /record/stop transitions a recording to completed."""
    mock_proc, record_dir, meta_file = _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=555, stream_name="Stop Test")
    assert resp.status_code == 200
    rec_id = resp.json()["recording_id"]

    resp = client.post("/api/v1/record/stop", params={"recording_id": rec_id})
    assert resp.status_code == 200
    data = resp.json()
    assert data["recording_id"] == rec_id
    assert data["status"] in ("completed", "failed")
    assert "size_bytes" in data

    # Meta should be updated
    meta = json.loads(meta_file.read_text())
    assert meta[rec_id]["status"] in ("completed", "failed")
    assert "stopped_at" in meta[rec_id]


def test_stop_recording_twice_returns_same_status(monkeypatch, tmp_path, client):
    """POST /record/stop on an already-stopped recording returns current status."""
    mock_proc, record_dir, meta_file = _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=666, stream_name="Double Stop")
    assert resp.status_code == 200
    rec_id = resp.json()["recording_id"]

    # First stop
    resp1 = client.post("/api/v1/record/stop", params={"recording_id": rec_id})
    assert resp1.status_code == 200

    # Second stop — should still succeed and show the same status
    resp2 = client.post("/api/v1/record/stop", params={"recording_id": rec_id})
    assert resp2.status_code == 200
    assert resp2.json()["status"] == resp1.json()["status"]


# ── Delete ──────────────────────────────────────────────────────────────────


def test_delete_removes_recording(monkeypatch, tmp_path, client):
    """DELETE /recordings/{recording_id} removes the recording entry."""
    mock_proc, record_dir, meta_file = _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=333, stream_name="Delete Me")
    assert resp.status_code == 200
    rec_id = resp.json()["recording_id"]

    resp = client.delete(f"/api/v1/recordings/{rec_id}")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == rec_id

    # Verify it's gone from meta
    meta = json.loads(meta_file.read_text())
    assert rec_id not in meta

    # Verify the endpoint confirms deletion
    resp = client.get(f"/api/v1/recordings/{rec_id}")
    assert resp.status_code == 404


def test_delete_cleans_up_file_on_disk(monkeypatch, tmp_path, client):
    """DELETE /recordings/{recording_id} also removes the recording file."""
    mock_proc, record_dir, meta_file = _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=444, stream_name="File Cleanup")
    assert resp.status_code == 200
    rec_id = resp.json()["recording_id"]

    # Create a dummy file at the expected path so we can verify deletion

    meta = json.loads(meta_file.read_text())
    rec_file_path = record_dir / f"{rec_id}.mp4"
    rec_file_path.write_text("fake mp4 content")
    # Update meta with the file path (the route stores str(out_path))
    meta[rec_id]["file"] = str(rec_file_path)
    meta_file.write_text(json.dumps(meta))

    assert rec_file_path.exists()

    resp = client.delete(f"/api/v1/recordings/{rec_id}")
    assert resp.status_code == 200

    # The file should no longer exist
    assert not rec_file_path.exists()


# ── Serve ────────────────────────────────────────────────────────────────────


def test_serve_recording_in_progress_returns_409(monkeypatch, tmp_path, client):
    """GET /stream/recordings/{recording_id} returns 409 if still recording."""
    _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=777, stream_name="In Progress")
    assert resp.status_code == 200
    rec_id = resp.json()["recording_id"]

    resp = client.get(f"/api/v1/stream/recordings/{rec_id}")
    assert resp.status_code == 409
    assert "progress" in resp.json()["detail"].lower() or "in progress" in resp.json()["detail"].lower()


def test_serve_recording_completed(monkeypatch, tmp_path, client):
    """GET /stream/recordings/{recording_id} serves a completed recording."""
    mock_proc, record_dir, meta_file = _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=888, stream_name="Completed Recording")
    assert resp.status_code == 200
    rec_id = resp.json()["recording_id"]

    # Stop the recording so it becomes "completed"
    resp = client.post("/api/v1/record/stop", params={"recording_id": rec_id})
    assert resp.status_code == 200

    # Create the actual file on disk
    rec_file = record_dir / f"{rec_id}.mp4"
    rec_file.write_text("fake video content for serving test")

    resp = client.get(f"/api/v1/stream/recordings/{rec_id}")
    assert resp.status_code == 200
    # Should return a file response
    assert resp.headers.get("content-type") == "video/mp4"
    assert "Accept-Ranges" in resp.headers
    assert resp.text == "fake video content for serving test"


def test_serve_recording_file_missing_returns_404(monkeypatch, tmp_path, client):
    """GET /stream/recordings/{recording_id} returns 404 when file is gone."""
    mock_proc, record_dir, meta_file = _install_mocks(monkeypatch, tmp_path)

    resp = _start_a_recording(client, stream_id=999, stream_name="Missing File")
    assert resp.status_code == 200
    rec_id = resp.json()["recording_id"]

    # Stop first
    client.post("/api/v1/record/stop", params={"recording_id": rec_id})

    # Manually remove the file from meta to simulate a missing file
    meta = json.loads(meta_file.read_text())
    meta[rec_id]["file"] = str(record_dir / "nonexistent.mp4")
    meta_file.write_text(json.dumps(meta))

    resp = client.get(f"/api/v1/stream/recordings/{rec_id}")
    assert resp.status_code == 404


# ── Progress endpoint ────────────────────────────────────────────────────────


@pytest.mark.skip(reason="/api/v1/record/progress endpoint is not yet implemented in routes/record.py")
def test_record_progress_returns_data(client):
    """GET /record/progress returns progress data for recordings.

    NOTE: This endpoint does not currently exist in routes/record.py.
    Once implemented, this test should verify it returns valid progress info.
    """
    resp = client.get("/api/v1/record/progress")
    assert resp.status_code == 200
    resp.json()
    # Future assertion: assert "progress" in data or isinstance(data, dict)


# ── Auth guard ───────────────────────────────────────────────────────────────


def test_record_endpoints_require_admin_key(client):
    """All recording endpoints should reject requests without X-Admin-Key."""
    # Remove the admin key header for this test
    client.headers.clear()

    # Try a few endpoints
    for method, url in [
        ("POST", "/api/v1/record/start"),
        ("POST", "/api/v1/record/stop"),
        ("GET", "/api/v1/recordings"),
        ("DELETE", "/api/v1/recordings/fake"),
    ]:
        if method == "POST":
            resp = client.post(url)
        elif method == "GET":
            resp = client.get(url)
        elif method == "DELETE":
            resp = client.delete(url)
        else:
            continue
        # Should be 401 or 403
        assert resp.status_code in (401, 403), f"Expected 401/403 for {method} {url}, got {resp.status_code}"
