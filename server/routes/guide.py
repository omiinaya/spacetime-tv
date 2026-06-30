"""EPG Guide, SSE, and enrichment routes — umbrella module.

Previously a 434-line monolithic file. Now decomposed into focused modules:
  - guide_core.py    — parse_xmltv(), EPG enrichment cache
  - guide_epg.py     — EPG loading, background refresh, broadcast loop, cache building
  - guide_routes.py  — all 4 route handlers (tv_guide, epg_sse, guide_now, guide_enrich)

All tests import from ``routes.guide`` and still work unchanged.
"""

# Re-export all public symbols for backward compatibility.
# Tests patch routes.guide.cached_fetch to mock upstream calls.
from iptv_client import cached_fetch, client as _client

from routes.guide_core import _EPG_ENRICH_CACHE, _EPG_ENRICH_TTL, parse_xmltv
from routes.guide_epg import (
    _build_guide_cache,
    _epg_broadcast_loop,
    _refresh_epg_background,
    load_epg,
    load_epg_background,
)

# Aggregated router
from routes.guide_routes import router as _guide_router

router = _guide_router

# Re-export route functions for test imports
from routes.guide_routes import epg_sse, guide_enrich
