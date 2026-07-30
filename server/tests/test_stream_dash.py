"""Tests for DASH MPD generation in routes.stream_dash.

Tests the pure functions generate_live_mpd and generate_vod_mpd directly
by importing from routes.stream_dash (not via re-export from routes.stream).
"""

import xml.etree.ElementTree as ET

from routes.stream_dash import generate_live_mpd, generate_vod_mpd

# ── Helpers ──────────────────────────────────────────────────────────────────


def _parse_mpd(xml_text: str) -> ET.Element:
    """Parse MPD XML and return root element."""
    return ET.fromstring(xml_text)


def _namespaced(tag: str) -> str:
    """Return a Clark notation tag for the DASH namespace."""
    return "{urn:mpeg:dash:schema:mpd:2011}" + tag


# ── generate_live_mpd ────────────────────────────────────────────────────────


class TestLiveMpd:
    def test_valid_xml(self):
        """Live MPD should be well-formed XML."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        assert root.tag.endswith("MPD")

    def test_type_is_dynamic(self):
        """Live MPD should have type='dynamic'."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        assert root.get("type") == "dynamic"

    def test_has_dash_namespace(self):
        """Live MPD should use DASH namespace."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        ns = root.tag.split("}")[0].strip("{") if "}" in root.tag else ""
        assert "urn:mpeg:dash" in ns

    def test_contains_base_url(self):
        """Live MPD should contain a BaseURL pointing to the stream endpoint."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        assert "/api/stream/live/12345" in xml

    def test_has_period_with_stream_id(self):
        """Live MPD Period id should match stream_id."""
        xml = generate_live_mpd(999, "/api/stream/live/999")
        root = _parse_mpd(xml)
        period = root.find(_namespaced("Period"))
        assert period is not None
        assert period.get("id") == "999"

    def test_has_adaptation_set_with_mime(self):
        """Live MPD should contain AdaptationSet with correct mimeType."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert len(ats) > 0
        assert ats[0].get("mimeType") == "video/mp2t"
        assert ats[0].get("contentType") == "video"

    def test_has_representation_with_bandwidth(self):
        """Live MPD should contain at least one Representation with bandwidth."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        reps = root.findall(f".//{_namespaced('Representation')}")
        assert len(reps) == 1
        assert reps[0].get("bandwidth") == "5000000"

    def test_has_segment_base(self):
        """Live MPD should contain SegmentBase with Initialization."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        sb = root.findall(f".//{_namespaced('SegmentBase')}")
        assert len(sb) == 1
        init = sb[0].find(_namespaced("Initialization"))
        assert init is not None
        assert init.get("range") == "0-0"

    def test_availability_and_publish_time_present(self):
        """Live MPD should have availabilityStartTime and publishTime."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        assert root.get("availabilityStartTime") is not None
        assert root.get("publishTime") is not None

    def test_minimum_update_period(self):
        """Live MPD should have minimumUpdatePeriod set."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        assert root.get("minimumUpdatePeriod") == "PT5S"

    def test_min_buffer_time(self):
        """Live MPD should have minBufferTime set."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        assert root.get("minBufferTime") == "PT15S"

    def test_xml_escapes_ampersand_in_url(self):
        """BaseURL should XML-escape '&' to '&amp;' in raw XML."""
        xml = generate_live_mpd(1, "/api/stream/live/1?token=a&b=c")
        assert "&amp;" in xml
        # XML parser decodes entities in .text, so check the raw string
        assert "&amp;" in xml.split("<BaseURL")[1].split("</BaseURL")[0]

    def test_xml_escapes_lt_gt_quote(self):
        """BaseURL should XML-escape '<', '>', and '\"' in raw XML."""
        xml = generate_live_mpd(1, '/api/stream/live/1"<>.mp4')
        assert "&lt;" in xml
        assert "&gt;" in xml
        assert "&quot;" in xml

    def test_profile_is_isoff_live_2011(self):
        """Live MPD should use isoff-live:2011 profile."""
        xml = generate_live_mpd(12345, "/api/stream/live/12345")
        root = _parse_mpd(xml)
        assert "isoff-live:2011" in root.get("profiles", "")


# ── generate_vod_mpd ────────────────────────────────────────────────────────


class TestVodMpd:
    def test_valid_xml(self):
        """VOD MPD should be well-formed XML."""
        xml = generate_vod_mpd(999, "movie", "/api/stream/movie/999")
        root = _parse_mpd(xml)
        assert root.tag.endswith("MPD")

    def test_type_is_static(self):
        """VOD MPD should have type='static'."""
        xml = generate_vod_mpd(999, "movie", "/api/stream/movie/999")
        root = _parse_mpd(xml)
        assert root.get("type") == "static"

    def test_contains_base_url(self):
        """VOD MPD should contain a BaseURL pointing to the stream endpoint."""
        xml = generate_vod_mpd(999, "movie", "/api/stream/movie/999")
        assert "/api/stream/movie/999" in xml

    def test_has_period_with_stream_id(self):
        """VOD MPD Period id should match stream_id."""
        xml = generate_vod_mpd(555, "movie", "/api/stream/movie/555")
        root = _parse_mpd(xml)
        period = root.find(_namespaced("Period"))
        assert period is not None
        assert period.get("id") == "555"

    def test_series_works(self):
        """VOD MPD for series should work the same as movie."""
        xml = generate_vod_mpd(555, "series", "/api/stream/series/0/555")
        root = _parse_mpd(xml)
        assert root.get("type") == "static"
        assert "/api/stream/series/0/555" in xml
        period = root.find(_namespaced("Period"))
        assert period.get("id") == "555"

    def test_media_type_param_accepted(self):
        """media_type parameter is accepted but doesn't affect output."""
        xml_movie = generate_vod_mpd(1, "movie", "/u")
        xml_series = generate_vod_mpd(1, "series", "/u")
        # Both should produce the same XML structure with same stream_id
        assert 'Period id="1"' in xml_movie
        assert 'Period id="1"' in xml_series

    def test_default_mime_no_extension(self):
        """VOD proxy URL without extension defaults to video/mp2t."""
        xml = generate_vod_mpd(1, "movie", "/api/stream/movie/1")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/mp2t"

    def test_mime_maps_ts(self):
        """URL ending in .ts maps to video/mp2t."""
        xml = generate_vod_mpd(1, "movie", "/file.ts")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/mp2t"

    def test_mime_maps_mkv(self):
        """URL ending in .mkv maps to video/x-matroska."""
        xml = generate_vod_mpd(1, "movie", "/file.mkv")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/x-matroska"

    def test_mime_maps_mp4(self):
        """URL ending in .mp4 maps to video/mp4."""
        xml = generate_vod_mpd(1, "movie", "/file.mp4")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/mp4"

    def test_mime_maps_m4v(self):
        """URL ending in .m4v maps to video/mp4."""
        xml = generate_vod_mpd(1, "movie", "/file.m4v")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/mp4"

    def test_mime_maps_webm(self):
        """URL ending in .webm maps to video/webm."""
        xml = generate_vod_mpd(1, "movie", "/file.webm")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/webm"

    def test_mime_maps_avi(self):
        """URL ending in .avi maps to video/x-msvideo."""
        xml = generate_vod_mpd(1, "movie", "/file.avi")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/x-msvideo"

    def test_mime_maps_mov(self):
        """URL ending in .mov maps to video/quicktime."""
        xml = generate_vod_mpd(1, "movie", "/file.mov")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/quicktime"

    def test_mime_maps_unknown_extension_defaults_to_mp2t(self):
        """URL with unknown extension defaults to video/mp2t."""
        xml = generate_vod_mpd(1, "movie", "/file.xyz")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/mp2t"

    def test_mime_with_query_string(self):
        """URL with query string — extension detection should ignore query."""
        xml = generate_vod_mpd(1, "movie", "/video.ts?token=abc&exp=123")
        root = _parse_mpd(xml)
        ats = root.findall(f".//{_namespaced('AdaptationSet')}")
        assert ats[0].get("mimeType") == "video/mp2t"

    def test_xml_escapes_ampersand(self):
        """BaseURL should XML-escape '&' to '&amp;' in raw XML."""
        xml = generate_vod_mpd(1, "movie", "/file.ts?a=1&b=2")
        assert "&amp;" in xml
        assert "&amp;" in xml.split("<BaseURL")[1].split("</BaseURL")[0]

    def test_xml_escapes_special_chars(self):
        """BaseURL should XML-escape '<', '>', '\"', and '&' in raw XML."""
        dangerous = '/path/"quoted"<tag>&stuff>.ts'
        xml = generate_vod_mpd(1, "movie", dangerous)
        assert "&quot;" in xml
        assert "&lt;" in xml
        assert "&gt;" in xml
        assert "&amp;" in xml

    def test_has_representation_with_bandwidth(self):
        """VOD MPD should contain Representation with bandwidth."""
        xml = generate_vod_mpd(999, "movie", "/api/stream/movie/999")
        root = _parse_mpd(xml)
        reps = root.findall(f".//{_namespaced('Representation')}")
        assert len(reps) == 1
        assert reps[0].get("bandwidth") == "5000000"

    def test_profile_is_isoff_on_demand_2011(self):
        """VOD MPD should use isoff-on-demand:2011 profile."""
        xml = generate_vod_mpd(999, "movie", "/api/stream/movie/999")
        root = _parse_mpd(xml)
        assert "isoff-on-demand:2011" in root.get("profiles", "")

    def test_has_segment_base(self):
        """VOD MPD should contain SegmentBase with Initialization."""
        xml = generate_vod_mpd(999, "movie", "/api/stream/movie/999")
        root = _parse_mpd(xml)
        sb = root.findall(f".//{_namespaced('SegmentBase')}")
        assert len(sb) == 1
        init = sb[0].find(_namespaced("Initialization"))
        assert init is not None
        assert init.get("range") == "0-0"


# ── Edge cases ──────────────────────────────────────────────────────────────


class TestEdgeCases:
    def test_live_mpd_zero_stream_id(self):
        """Zero stream_id should be handled gracefully."""
        xml = generate_live_mpd(0, "/api/stream/live/0")
        root = _parse_mpd(xml)
        period = root.find(_namespaced("Period"))
        assert period.get("id") == "0"
        assert "/api/stream/live/0" in xml

    def test_vod_mpd_negative_stream_id(self):
        """Negative stream_id should produce valid XML."""
        xml = generate_vod_mpd(-1, "movie", "/stream")
        _parse_mpd(xml)  # should not raise

    def test_live_mpd_empty_base_url(self):
        """Empty base_url should still produce valid XML (BaseURL element with no text)."""
        xml = generate_live_mpd(1, "")
        root = _parse_mpd(xml)
        base_urls = root.findall(f".//{_namespaced('BaseURL')}")
        assert base_urls[0].text is None  # empty element has no text node

    def test_vod_mpd_empty_base_url(self):
        """Empty base_url for VOD should still produce valid XML (BaseURL element with no text)."""
        xml = generate_vod_mpd(1, "movie", "")
        root = _parse_mpd(xml)
        base_urls = root.findall(f".//{_namespaced('BaseURL')}")
        assert base_urls[0].text is None  # empty element has no text node

    def test_live_mpd_xml_declaration(self):
        """MPD should start with XML declaration."""
        xml = generate_live_mpd(1, "/api/stream/live/1")
        assert xml.startswith('<?xml version="1.0" encoding="utf-8"?>')

    def test_vod_mpd_xml_declaration(self):
        """MPD should start with XML declaration."""
        xml = generate_vod_mpd(1, "movie", "/api/stream/movie/1")
        assert xml.startswith('<?xml version="1.0" encoding="utf-8"?>')

    def test_live_mpd_utf_encoding(self):
        """XML declaration should specify utf-8."""
        xml = generate_live_mpd(1, "/u")
        assert 'encoding="utf-8"' in xml

    def test_vod_mpd_utf_encoding(self):
        """XML declaration should specify utf-8."""
        xml = generate_vod_mpd(1, "movie", "/u")
        assert 'encoding="utf-8"' in xml

    def test_large_stream_id(self):
        """Large stream_id should not break XML generation."""
        xml = generate_live_mpd(999999999, "/api/stream/live/999999999")
        root = _parse_mpd(xml)
        period = root.find(_namespaced("Period"))
        assert period.get("id") == "999999999"

    def test_large_stream_id_vod(self):
        """Large stream_id for VOD should not break XML generation."""
        xml = generate_vod_mpd(999999999, "movie", "/path")
        root = _parse_mpd(xml)
        period = root.find(_namespaced("Period"))
        assert period.get("id") == "999999999"
