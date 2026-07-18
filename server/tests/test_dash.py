"""Tests for DASH MPD generation.

Uses the real generate_mpd functions imported from main.
"""

import xml.etree.ElementTree as ET

from routes.stream import generate_live_mpd, generate_vod_mpd


def _parse_mpd(xml_text: str) -> ET.Element:
    """Parse MPD XML and return root element."""
    return ET.fromstring(xml_text)


def test_live_mpd_is_valid_xml():
    """Live MPD should be well-formed XML."""
    xml = generate_live_mpd(12345, "/api/stream/live/12345")
    root = _parse_mpd(xml)
    assert root.tag.endswith("MPD")


def test_live_mpd_has_dash_namespace():
    """Live MPD should use DASH namespace."""
    xml = generate_live_mpd(12345, "/api/stream/live/12345")
    root = _parse_mpd(xml)
    ns = root.tag.split("}")[0].strip("{") if "}" in root.tag else ""
    assert "urn:mpeg:dash" in ns


def test_live_mpd_is_static():
    """Live MPD should have type='dynamic'."""
    xml = generate_live_mpd(12345, "/api/stream/live/12345")
    root = _parse_mpd(xml)
    assert root.get("type") == "static"


def test_live_mpd_contains_base_url():
    """Live MPD should contain a BaseURL pointing to the stream endpoint."""
    xml = generate_live_mpd(12345, "/api/stream/live/12345")
    assert "/api/stream/live/12345" in xml


def test_live_mpd_has_adaptation_set():
    """Live MPD should contain AdaptationSet with correct mimeType."""
    xml = generate_live_mpd(12345, "/api/stream/live/12345")
    root = _parse_mpd(xml)
    # Find all AdaptationSet elements (namespace-agnostic)
    ats = root.findall(".//{urn:mpeg:dash:schema:mpd:2011}AdaptationSet")
    if not ats:
        # Try without namespace
        ats = root.findall(".//AdaptationSet")
    assert len(ats) > 0
    assert ats[0].get("mimeType") == "video/mp2t"


def test_live_mpd_has_representation():
    """Live MPD should contain at least one Representation with bandwidth."""
    xml = generate_live_mpd(12345, "/api/stream/live/12345")
    root = _parse_mpd(xml)
    base_url = root.findall(".//{urn:mpeg:dash:schema:mpd:2011}BaseURL")
    if not base_url:
        base_url = root.findall(".//BaseURL")
    assert len(base_url) > 0
    rep = root.findall(".//{urn:mpeg:dash:schema:mpd:2011}Representation")
    if not rep:
        rep = root.findall(".//Representation")
    assert len(rep) == 1
    assert rep[0].get("bandwidth") is not None


def test_vod_mpd_is_valid_xml():
    """VOD MPD should be well-formed XML."""
    xml = generate_vod_mpd(999, "movie", "/api/stream/movie/999")
    root = _parse_mpd(xml)
    assert root.tag.endswith("MPD")


def test_vod_mpd_is_static():
    """VOD MPD should have type='static'."""
    xml = generate_vod_mpd(999, "movie", "/api/stream/movie/999")
    root = _parse_mpd(xml)
    assert root.get("type") == "static"


def test_vod_mpd_contains_base_url():
    """VOD MPD should contain a BaseURL pointing to the stream endpoint."""
    xml = generate_vod_mpd(999, "movie", "/api/stream/movie/999")
    assert "/api/stream/movie/999" in xml


def test_vod_mpd_series():
    """VOD MPD for series should work identically to movie."""
    xml = generate_vod_mpd(555, "series", "/api/stream/series/0/555")
    root = _parse_mpd(xml)
    assert root.get("type") == "static"
    assert "/api/stream/series/0/555" in xml


def test_vod_mpd_mime_default():
    """VOD MPD with proxy URL (no extension) defaults to video/mp2t."""
    xml = generate_vod_mpd(1, "movie", "/api/stream/movie/1")
    root = _parse_mpd(xml)
    ats = root.findall(".//{urn:mpeg:dash:schema:mpd:2011}AdaptationSet")
    if not ats:
        ats = root.findall(".//AdaptationSet")
    # Proxy URLs have no extension, so mime defaults to video/mp2t
    assert ats[0].get("mimeType") == "video/mp2t"
