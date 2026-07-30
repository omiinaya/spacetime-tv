"""Stream routes — umbrella module that aggregates all sub-routers.

Previously a 1105-line monolithic file. Now decomposed into focused modules:
  - stream_core.py   — shared helpers (generators, pipes, URL builders, MIME, probe cache)
  - stream_live.py   — live TV proxy, transcode, quality-limited transcoding
  - stream_vod.py    — VOD remux, transcode, direct playback with Range support
  - stream_convert.py— MKV→MP4 conversion + cached MP4 serving
  - stream_hls.py    — HLS segmentation and segment serving
  - stream_dash.py   — DASH MPD manifest generation
  - stream_probe.py  — ffprobe-based codec detection

All tests import from ``routes.stream`` and still work unchanged.
"""

from fastapi import APIRouter

from routes.stream_convert import CACHE_DIR, _converting, serve_cached_mp4  # noqa: F401
from routes.stream_convert import router as _convert_router

# Re-export all public symbols for backward compatibility with tests.
# These allow ``from routes.stream import build_stream_url`` etc. to keep working.
from routes.stream_core import (
    _ffmpeg_pipe,
    _http_iter_chunks,
    _lookup_extension,
    _mime_from_url,
    _probe_cache,
    build_stream_url,
    get_content_length,
    stream_proxy,
)
from routes.stream_dash import generate_live_mpd, generate_vod_mpd  # noqa: F401
from routes.stream_dash import router as _dash_router
from routes.stream_hls import router as _hls_router
from routes.stream_hls import serve_hls_file  # noqa: F401
from routes.stream_live import router as _live_router
from routes.stream_probe import probe_stream  # noqa: F401
from routes.stream_probe import router as _probe_router
from routes.stream_vod import router as _vod_router

# Aggregated router — includes all sub-routers so main.py's
# ``from routes.stream import router`` picks up every route.
router = APIRouter(tags=["stream"])
router.include_router(_live_router)
router.include_router(_vod_router)
router.include_router(_convert_router)
router.include_router(_hls_router)
router.include_router(_dash_router)
router.include_router(_probe_router)
