"""DASH MPD manifest generation and serving.

All stream BaseURLs use server-proxied paths to avoid exposing
IPTV credentials (username/password) to the client browser.
"""

from fastapi import APIRouter, Response

router = APIRouter(tags=["dash"])


def generate_live_mpd(stream_id: int, base_url: str) -> str:
    """Generate a DASH MPD manifest for live TV playback."""
    mime = "video/mp2t"
    safe_url = base_url.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
        '     xmlns="urn:mpeg:dash:schema:mpd:2011"\n'
        '     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"\n'
        '     type="static">\n'
        " <Period>\n"
        f'    <AdaptationSet mimeType="{mime}" contentType="video" startWithSAP="1">\n'
        '      <Representation bandwidth="5000000">\n'
        f"        <BaseURL>{safe_url}</BaseURL>\n"
        '        <SegmentBase indexRangeExact="true">\n'
        '          <Initialization range="0-0" />\n'
        "        </SegmentBase>\n"
        "      </Representation>\n"
        "    </AdaptationSet>\n"
        " </Period>\n"
        "</MPD>"
    )


def generate_vod_mpd(stream_id: int, media_type: str, base_url: str) -> str:
    """Generate a DASH MPD manifest for VOD playback."""
    ext = base_url.rsplit(".", 1)[-1].lower() if "." in base_url else ""
    mime_map = {
        "ts": "video/mp2t",
        "mkv": "video/x-matroska",
        "mp4": "video/mp4",
        "m4v": "video/mp4",
        "webm": "video/webm",
        "avi": "video/x-msvideo",
        "mov": "video/quicktime",
    }
    mime = mime_map.get(ext, "video/mp2t")
    safe_url = base_url.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
        '     xmlns="urn:mpeg:dash:schema:mpd:2011"\n'
        '     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"\n'
        '     type="static">\n'
        " <Period>\n"
        f'    <AdaptationSet mimeType="{mime}" contentType="video" startWithSAP="1">\n'
        '      <Representation bandwidth="5000000">\n'
        f"        <BaseURL>{safe_url}</BaseURL>\n"
        '        <SegmentBase indexRangeExact="true">\n'
        '          <Initialization range="0-0" />\n'
        "        </SegmentBase>\n"
        "      </Representation>\n"
        "    </AdaptationSet>\n"
        " </Period>\n"
        "</MPD>"
    )


@router.get("/stream/live/{stream_id}/manifest.mpd")
async def live_dash_manifest(stream_id: int):
    """DASH MPD for live TV using server-proxied URL (no credential leak)."""
    proxy_url = "/api/stream/live/{0}".format(stream_id)
    xml = generate_live_mpd(stream_id, proxy_url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/stream/movie/{stream_id}/manifest.mpd")
async def movie_dash_manifest(stream_id: int):
    """DASH MPD for movie using server-proxied URL (no credential leak)."""
    proxy_url = "/api/stream/movie/{0}".format(stream_id)
    xml = generate_vod_mpd(stream_id, "movie", proxy_url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/stream/series/{series_id}/{episode_id}/manifest.mpd")
async def series_dash_manifest(series_id: int, episode_id: int):
    """DASH MPD for series episode using server-proxied URL (no credential leak)."""
    proxy_url = "/api/stream/series/{0}/{1}".format(series_id, episode_id)
    xml = generate_vod_mpd(episode_id, "series", proxy_url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={"Cache-Control": "no-cache"},
    )
