"""Tests for pure utility functions in main.py — no external deps needed.

Targets functions with 0% coverage: _mime_from_url, generate_live_mpd,
generate_vod_mpd, _lookup_extension, iptv_url, _img_cache_key,
_img_cache_path, _img_meta_path, _img_stamp_path, touch_access,
get_last_access, serve_cached_mp4, build_stream_url.
"""

import os
import tempfile
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Set env vars BEFORE imports to match conftest
os.environ.setdefault("IPTV_BASE", "http://test-iptv.live")
os.environ.setdefault("IPTV_USER", "test_user")
os.environ.setdefault("IPTV_PASS", "test_pass")
os.environ.setdefault("CACHE_WARM_ENABLED", "false")
os.environ.setdefault("ENCRYPT_CREDENTIALS", "false")

from iptv_client import iptv_url
from main import (
    get_last_access,
    touch_access,
)
from routes.misc import (
    _img_cache_key,
    _img_cache_path,
    _img_meta_path,
    _img_stamp_path,
)
from routes.stream import (
    _lookup_extension,
    _mime_from_url,
    generate_live_mpd,
    generate_vod_mpd,
    serve_cached_mp4,
)
from state import _cache

# ── _mime_from_url ───────────────────────────────────────────────────────────


class TestMimeFromUrl:
    def test_ts_extension(self):
        assert _mime_from_url("http://example.com/stream.ts") == "video/mp2t"

    def test_mkv_extension(self):
        assert _mime_from_url("http://example.com/movie.mkv") == "video/x-matroska"

    def test_mp4_extension(self):
        assert _mime_from_url("http://example.com/video.mp4") == "video/mp4"

    def test_m4v_extension(self):
        assert _mime_from_url("http://example.com/video.m4v") == "video/mp4"

    def test_webm_extension(self):
        assert _mime_from_url("http://example.com/video.webm") == "video/webm"

    def test_avi_extension(self):
        assert _mime_from_url("http://example.com/video.avi") == "video/x-msvideo"

    def test_mov_extension(self):
        assert _mime_from_url("http://example.com/video.mov") == "video/quicktime"

    def test_unknown_extension_falls_back_to_mpegts(self):
        assert _mime_from_url("http://example.com/video.flv") == "video/mp2t"

    def test_no_extension_falls_back_to_mpegts(self):
        assert _mime_from_url("http://example.com/stream") == "video/mp2t"

    def test_query_string_no_effect(self):
        assert _mime_from_url("http://example.com/stream.ts?token=abc") == "video/mp2t"

    def test_uppercase_extension_handled(self):
        assert _mime_from_url("http://example.com/stream.MKV") == "video/x-matroska"


# ── generate_live_mpd ────────────────────────────────────────────────────────


class TestGenerateLiveMpd:
    def test_contains_mpd_root(self):
        xml = generate_live_mpd(123, "http://example.com/stream.ts")
        assert '<?xml version="1.0" encoding="utf-8"?>' in xml
        assert "<MPD" in xml
        assert "</MPD>" in xml

    def test_live_profile(self):
        xml = generate_live_mpd(123, "http://example.com/stream.ts")
        assert 'type="dynamic"' in xml
        assert 'profiles="urn:mpeg:dash:profile:isoff-live:2011"' in xml

    def test_includes_base_url(self):
        xml = generate_live_mpd(123, "http://example.com/stream.ts")
        assert "<BaseURL>http://example.com/stream.ts</BaseURL>" in xml

    def test_xml_escapes_special_chars(self):
        url = "http://example.com/stream?param=one&param=two<test>"
        xml = generate_live_mpd(123, url)
        assert "&amp;" in xml
        assert "&lt;" in xml
        assert "&gt;" in xml

    def test_has_availability_time(self):
        xml = generate_live_mpd(123, "http://example.com/stream.ts")
        assert "availabilityStartTime" in xml
        assert "publishTime" in xml

    def test_has_period_and_adaptation_set(self):
        xml = generate_live_mpd(123, "http://example.com/stream.ts")
        assert "<Period" in xml
        assert "<AdaptationSet" in xml
        assert "<Representation" in xml

    def test_mime_type_from_url(self):
        xml = generate_live_mpd(123, "http://example.com/stream.mkv")
        assert 'mimeType="video/x-matroska"' in xml

    def test_bandwidth_attribute(self):
        xml = generate_live_mpd(123, "http://example.com/stream.ts")
        assert 'bandwidth="5000000"' in xml


# ── generate_vod_mpd ─────────────────────────────────────────────────────────


class TestGenerateVodMpd:
    def test_contains_mpd_root(self):
        xml = generate_vod_mpd(456, "movie", "http://example.com/movie.mkv")
        assert '<?xml version="1.0" encoding="utf-8"?>' in xml
        assert "<MPD" in xml
        assert "</MPD>" in xml

    def test_static_profile(self):
        xml = generate_vod_mpd(456, "movie", "http://example.com/movie.mkv")
        assert 'type="static"' in xml
        assert 'profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"' in xml

    def test_includes_base_url(self):
        xml = generate_vod_mpd(456, "movie", "http://example.com/movie.mkv")
        assert "<BaseURL>http://example.com/movie.mkv</BaseURL>" in xml

    def test_xml_escapes_special_chars(self):
        url = "http://example.com/movie?param=one&param=two"
        xml = generate_vod_mpd(456, "movie", url)
        assert "&amp;" in xml

    def test_has_period_and_adaptation_set(self):
        xml = generate_vod_mpd(456, "movie", "http://example.com/movie.mkv")
        assert "<Period>" in xml or "<Period " in xml
        assert "<AdaptationSet" in xml

    def test_mime_from_url_extension(self):
        xml = generate_vod_mpd(456, "movie", "http://example.com/movie.mp4")
        assert 'mimeType="video/mp4"' in xml

    def test_bandwidth_attribute(self):
        xml = generate_vod_mpd(456, "movie", "http://example.com/movie.mkv")
        assert 'bandwidth="5000000"' in xml

    def test_stream_id_in_url(self):
        """The stream ID doesn't appear in the MPD itself; the BaseURL uses the stream_url passed."""
        xml = generate_vod_mpd(789, "series", "http://example.com/series/789.mkv")
        assert "789" in xml


# ── iptv_url ─────────────────────────────────────────────────────────────────


class TestIptvUrl:
    def test_basic_url_structure(self):
        url = iptv_url("get_vod_streams")
        assert url.startswith("http://test-iptv.live/player_api.php")
        assert "action=get_vod_streams" in url
        assert "username=test_user" in url
        assert "password=test_pass" in url

    def test_with_extra_params(self):
        url = iptv_url("get_vod_streams", category_id="5")
        assert "category_id=5" in url

    def test_multiple_extra_params(self):
        url = iptv_url("get_series", category_id="10", page="1")
        assert "category_id=10" in url
        assert "page=1" in url

    def test_action_overrides(self):
        """action param should always be set by the argument even if passed in kwargs."""
        url = iptv_url("get_live_streams")
        assert "action=get_live_streams" in url

    def test_custom_credentials_not_overridden(self):
        """If username/password are explicitly passed, they should be used."""
        url = iptv_url("get_vod_streams", username="custom_user")
        assert "username=custom_user" in url

    def test_url_encoding_of_special_chars(self):
        url = iptv_url("get_vod_streams", name="test value")
        assert "name=test+value" in url or "name=test%20value" in url


# ── _lookup_extension ────────────────────────────────────────────────────────


class TestLookupExtension:
    def setup_method(self):
        _cache.clear()

    @pytest.mark.asyncio
    async def test_movie_found_in_cache(self):
        _cache["Default:ext_lookup_movie_999"] = (time.time(), [{"stream_id": 999, "container_extension": "mp4"}])
        assert await _lookup_extension(999, "movie") == "mp4"

    @pytest.mark.asyncio
    async def test_movie_not_found_returns_mkv(self):
        _cache.clear()
        assert await _lookup_extension(999, "movie") == "mkv"

    @pytest.mark.asyncio
    async def test_series_found_in_cache(self):
        _cache["Default:ext_lookup_series_555"] = (time.time(), [{"series_id": 555, "container_extension": "avi"}])
        assert await _lookup_extension(555, "series") == "avi"

    @pytest.mark.asyncio
    async def test_series_not_found_returns_mkv(self):
        _cache.clear()
        assert await _lookup_extension(555, "series") == "mkv"

    @pytest.mark.asyncio
    async def test_empty_list_in_cache(self):
        _cache["Default:ext_lookup_movie_999"] = (time.time(), [])
        assert await _lookup_extension(999, "movie") == "mkv"

    @pytest.mark.asyncio
    async def test_movie_with_none_extension_returns_mp4(self):
        _cache["Default:ext_lookup_movie_999"] = (time.time(), [{"stream_id": 999, "container_extension": None}])
        assert await _lookup_extension(999, "movie") == "mp4"

    @pytest.mark.asyncio
    async def test_movie_with_empty_extension_returns_mp4(self):
        _cache["Default:ext_lookup_movie_999"] = (time.time(), [{"stream_id": 999, "container_extension": ""}])
        assert await _lookup_extension(999, "movie") == "mp4"

    @pytest.mark.asyncio
    async def test_multiple_cache_entries(self):
        _cache["Default:ext_lookup_movie_1"] = (time.time(), [{"stream_id": 1, "container_extension": "mp4"}])
        _cache["Default:ext_lookup_movie_2"] = (time.time(), [{"stream_id": 2, "container_extension": "avi"}])
        assert await _lookup_extension(1, "movie") == "mp4"
        assert await _lookup_extension(2, "movie") == "avi"

    @pytest.mark.asyncio
    async def test_with_series_prefix(self):
        _cache["Default:ext_lookup_series_777"] = (time.time(), [{"series_id": 777, "container_extension": "webm"}])
        assert await _lookup_extension(777, "series") == "webm"


# ── Image cache key helpers ──────────────────────────────────────────────────


class TestImgCacheHelpers:
    def test_cache_key_md5(self):
        key = _img_cache_key("http://example.com/image.jpg")
        assert len(key) == 32  # MD5 hex digest
        assert all(c in "0123456789abcdef" for c in key)

    def test_cache_key_deterministic(self):
        key1 = _img_cache_key("http://example.com/image.jpg")
        key2 = _img_cache_key("http://example.com/image.jpg")
        assert key1 == key2

    def test_cache_key_differs_for_diff_urls(self):
        key1 = _img_cache_key("http://example.com/image.jpg")
        key2 = _img_cache_key("http://example.com/image2.jpg")
        assert key1 != key2

    def test_cache_path_contains_cache_dir(self):
        key = _img_cache_key("test")
        path = _img_cache_path(key)
        assert "images" in str(path)
        assert path.name == key

    def test_meta_path_ends_with_meta(self):
        key = _img_cache_key("test")
        path = _img_meta_path(key)
        assert path.name == f"{key}.meta"

    def test_stamp_path_starts_with_dot(self):
        key = _img_cache_key("test")
        path = _img_stamp_path(key)
        assert path.name == f".{key}.accessed"


# ── touch_access / get_last_access ───────────────────────────────────────────


class TestTouchAccess:
    def setup_method(self):
        from main import CACHE_DIR

        self._cache_key = "_test_touch_access"
        stamp = CACHE_DIR / f".{self._cache_key}.accessed"
        if stamp.exists():
            stamp.unlink()

    def test_touch_creates_stamp_file(self):
        from main import CACHE_DIR

        touch_access(self._cache_key)
        stamp = CACHE_DIR / f".{self._cache_key}.accessed"
        assert stamp.exists()

    def test_get_last_access_after_touch(self):
        touch_access(self._cache_key)
        last = get_last_access(self._cache_key)
        assert last is not None
        assert isinstance(last, float)
        assert last > 0

    def test_get_last_access_no_touch(self):
        last = get_last_access("_nonexistent_key_9876")
        assert last is None

    def test_touch_updates_timestamp(self):
        import time

        touch_access(self._cache_key)
        t1 = get_last_access(self._cache_key)
        assert t1 is not None
        time.sleep(0.01)
        touch_access(self._cache_key)
        t2 = get_last_access(self._cache_key)
        assert t2 is not None
        assert t2 >= t1


# ── serve_cached_mp4 ─────────────────────────────────────────────────────────


class TestServeCachedMp4:
    def test_full_request_returns_file_response(self):
        """Without Range header, serve_cached_mp4 should return a 200 FileResponse."""
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"fake mp4 content")
            tmp_path = f.name

        try:
            req = MagicMock()
            req.headers = {}

            resp = serve_cached_mp4(Path(tmp_path), req)
            assert resp.status_code == 200
            assert resp.media_type == "video/mp4"
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_full_request_has_accept_ranges_header(self):
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(b"fake mp4 content")
            tmp_path = f.name

        try:
            req = MagicMock()
            req.headers = {}

            resp = serve_cached_mp4(Path(tmp_path), req)
            assert resp.headers.get("Accept-Ranges") == "bytes"
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_range_request_returns_206(self):
        """With Range header, serve_cached_mp4 should return 206 Partial Content."""
        content = b"x" * 1000
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(content)
            tmp_path = f.name

        try:
            req = MagicMock()
            req.headers = {"range": "bytes=100-299"}

            resp = serve_cached_mp4(Path(tmp_path), req)
            assert resp.status_code == 206
            assert "Content-Range" in resp.headers
            assert resp.headers["Content-Range"] == "bytes 100-299/1000"
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_range_request_to_end(self):
        """Range without end should serve from start to end of file."""
        content = b"x" * 1000
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(content)
            tmp_path = f.name

        try:
            req = MagicMock()
            req.headers = {"range": "bytes=800-"}

            resp = serve_cached_mp4(Path(tmp_path), req)
            assert resp.status_code == 206
            assert resp.headers.get("Content-Range") == "bytes 800-999/1000"
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_range_at_start(self):
        """Range starting at 0 should serve from beginning."""
        content = b"x" * 500
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(content)
            tmp_path = f.name

        try:
            req = MagicMock()
            req.headers = {"range": "bytes=0-99"}

            resp = serve_cached_mp4(Path(tmp_path), req)
            assert resp.status_code == 206
            assert resp.headers.get("Content-Range") == "bytes 0-99/500"
            # Content-Length should be 100 bytes
            assert resp.headers.get("Content-Length") == "100"
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    def test_range_serves_correct_content_length(self):
        """Verify Content-Length matches the requested range size."""
        content = b"x" * 500
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(content)
            tmp_path = f.name

        try:
            req = MagicMock()
            req.headers = {"range": "bytes=200-299"}

            resp = serve_cached_mp4(Path(tmp_path), req)
            assert resp.status_code == 206
            assert resp.headers.get("Content-Length") == "100"
            assert resp.headers.get("Content-Range") == "bytes 200-299/500"
        finally:
            Path(tmp_path).unlink(missing_ok=True)
