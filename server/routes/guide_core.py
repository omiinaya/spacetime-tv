"""EPG core — XMLTV parsing and enrichment cache.

Extracted from guide.py during decomposition of the 434-line monolithic file.
"""
import xml.etree.ElementTree as ET

# ── EPG Enrichment cache (TMDB metadata cache) ──────────────────────────
_EPG_ENRICH_CACHE: dict[str, tuple[float, dict | None]] = {}
_EPG_ENRICH_TTL = 3600


# ── XMLTV Parsing ───────────────────────────────────────────────────────
def parse_xmltv(xml_text: str) -> dict:
    """Parse XMLTV into structured data."""
    root = ET.fromstring(xml_text)

    channels = []
    for ch in root.findall("channel"):
        icon_el = ch.find("icon")
        channels.append({
            "id": ch.get("id", ""),
            "name": " ".join(
                (ch.findtext("display-name") or "").split()
            ),
            "icon": icon_el.get("src", "") if icon_el is not None else "",
        })

    programmes = []
    for prog in root.findall("programme"):
        start_str = prog.get("start", "")
        stop_str = prog.get("stop", "")
        channel = prog.get("channel", "")

        title_el = prog.find("title")
        desc_el = prog.find("desc")
        icon_el = prog.find("icon")
        cat_el = prog.find("category")
        subtitle_el = prog.find("sub-title")

        programmes.append({
            "channel": channel,
            "start": start_str,
            "stop": stop_str,
            "title": (title_el.text or "") if title_el is not None else "",
            "subtitle": (subtitle_el.text or "") if subtitle_el is not None else "",
            "desc": (desc_el.text or "") if desc_el is not None else "",
            "icon": (icon_el.get("src", "")) if icon_el is not None else "",
            "category": (cat_el.text or "") if cat_el is not None else "",
        })

    return {"channels": channels, "programmes": programmes}
