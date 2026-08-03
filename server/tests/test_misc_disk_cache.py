"""Tests for misc route disk-cache helpers — direct unit tests without HTTP."""

import json
import time
from pathlib import Path
from unittest.mock import patch

from routes import misc

_CACHE_KEY = "abc123def456"


def _img_dir(tmp_path: Path):
    """Return a context manager that points misc.IMG_CACHE_DIR at tmp_path."""
    return patch.object(misc, "IMG_CACHE_DIR", tmp_path)


def test_write_then_read_roundtrip(tmp_path):
    """Write + read returns (content, content_type, ts)."""
    with _img_dir(tmp_path):
        misc._img_write_disk(_CACHE_KEY, b"\x89PNG", "image/png")
        result = misc._img_read_disk(_CACHE_KEY)
    assert result is not None
    content, ct, ts = result
    assert content == b"\x89PNG"
    assert ct == "image/png"
    assert isinstance(ts, float)


def test_read_missing_returns_none(tmp_path):
    with _img_dir(tmp_path):
        assert misc._img_read_disk("does-not-exist") is None


def test_read_meta_missing_returns_none(tmp_path):
    with _img_dir(tmp_path):
        misc._img_write_disk(_CACHE_KEY, b"abc", "image/jpeg")
        # Delete the meta file so only content exists.
        misc._img_meta_path(_CACHE_KEY).unlink()
        assert misc._img_read_disk(_CACHE_KEY) is None


def test_read_expired_deletes_files(tmp_path):
    with _img_dir(tmp_path):
        misc._img_write_disk(_CACHE_KEY, b"abc", "image/png")
        # Backdate the metadata timestamp beyond the TTL.
        misc._img_meta_path(_CACHE_KEY).write_text(
            json.dumps({"ct": "image/png", "ts": time.time() - misc._IMG_DISK_TTL - 1})
        )
        assert misc._img_read_disk(_CACHE_KEY) is None
        # Expired files were cleaned up.
        assert not misc._img_cache_path(_CACHE_KEY).exists()
        assert not misc._img_meta_path(_CACHE_KEY).exists()


def test_read_corrupt_meta_returns_none(tmp_path):
    with _img_dir(tmp_path):
        misc._img_write_disk(_CACHE_KEY, b"abc", "image/png")
        misc._img_meta_path(_CACHE_KEY).write_text("not-json{{{")
        assert misc._img_read_disk(_CACHE_KEY) is None


def test_write_handles_oserror(tmp_path):
    with _img_dir(tmp_path):
        # Force write failure by pointing at a path that is a file, not dir.
        with patch.object(misc, "_img_cache_path", side_effect=OSError("disk full")):
            # Must not raise.
            misc._img_write_disk(_CACHE_KEY, b"abc", "image/png")


def test_cache_key_is_stable_md5():
    k1 = misc._img_cache_key("http://image.tmdb.org/t/p/t.jpg")
    assert k1 == misc._img_cache_key("http://image.tmdb.org/t/p/t.jpg")
    assert len(k1) == 32


def test_cache_path_helpers_under_dir(tmp_path):
    with _img_dir(tmp_path):
        assert misc._img_cache_path(_CACHE_KEY) == tmp_path / _CACHE_KEY
        assert misc._img_meta_path(_CACHE_KEY) == tmp_path / f"{_CACHE_KEY}.meta"
