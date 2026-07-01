"""DASH streaming routes — MPD manifest generation and serving.

Extracted from stream.py during decomposition of the 1105-line monolithic file.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import Response

from .stream_core import _mime_from_url, build_stream_url

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["stream"])


def generate_live_mpd(stream_id: int, stream_url: str) -> str:
    """Generate a dynamic MPD manifest for a live MPEG-TS stream."""
    mime = _mime_from_url(stream_url)
    safe_url = stream_url.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f'''<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="dynamic"
     availabilityStartTime="{now_iso}"
     publishTime="{now_iso}"
     minimumUpdatePeriod="PT10S"
     minBufferTime="PT15S"
     timeShiftBufferDepth="PT120S">
 <Period id="1">
    <AdaptationSet mimeType="{mime}" contentType="video" startWithSAP="1">
      <Representation bandwidth="5000000">
        <BaseURL>{safe_url}</BaseURL>
        <SegmentBase indexRangeExact="true">
          <Initialization range="0-0" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
 </Period>
</MPD>'''


def generate_vod_mpd(stream_id: int, stream_type: str, stream_url: str) -> str:
    """Generate a static onDemand MPD manifest for a VOD MKV/fMP4 stream."""
    mime = _mime_from_url(stream_url)
    safe_url = stream_url.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    return f'''<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"
     type="static">
 <Period>
    <AdaptationSet mimeType="{mime}" contentType="video" startWithSAP="1">
      <Representation bandwidth="5000000">
        <BaseURL>{safe_url}</BaseURL>
        <SegmentBase indexRangeExact="true">
          <Initialization range="0-0" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
 </Period>
</MPD>'''


@router.get("/stream/live/{stream_id}/manifest.mpd")
async def live_dash_manifest(stream_id: int):
    """DASH MPD manifest for live TV stream playback via shaka-player."""
    url = await build_stream_url(stream_id, "live")
    xml = generate_live_mpd(stream_id, url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
    )


@router.get("/stream/movie/{stream_id}/manifest.mpd")
async def movie_dash_manifest(stream_id: int):
    """DASH MPD manifest for movie playback via shaka-player."""
    url = await build_stream_url(stream_id, "movie")
    xml = generate_vod_mpd(stream_id, "movie", url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
    )


@router.get("/stream/series/{series_id}/{episode_id}/manifest.mpd")
async def series_dash_manifest(series_id: int, episode_id: int):
    """DASH MPD manifest for series episode playback via shaka-player."""
    url = await build_stream_url(episode_id, "series")
    xml = generate_vod_mpd(episode_id, "series", url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
    )
