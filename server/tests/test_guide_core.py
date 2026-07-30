"""Tests for guide_core.py — XMLTV EPG data parsing."""

import pytest

# ═══════════════════════════════════════════════════════════════════════════════
# parse_xmltv
# ═══════════════════════════════════════════════════════════════════════════════


class TestParseXmltv:
    """XMLTV parsing with various input shapes."""

    def test_empty_xmltv_returns_empty_lists(self):
        """Minimal valid XMLTV with no channels/programmes."""
        from routes.guide_core import parse_xmltv

        xml = '<?xml version="1.0" encoding="utf-8"?>\n<tv>\n</tv>'
        result = parse_xmltv(xml)
        assert result == {"channels": [], "programmes": []}

    def test_single_channel_with_icon(self):
        """A channel with display-name and icon is parsed correctly."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <channel id="ch1.example.com">
    <display-name>Channel One</display-name>
    <icon src="http://example.com/icon.png"/>
  </channel>
</tv>"""
        result = parse_xmltv(xml)
        assert len(result["channels"]) == 1
        ch = result["channels"][0]
        assert ch["id"] == "ch1.example.com"
        assert ch["name"] == "Channel One"
        assert ch["icon"] == "http://example.com/icon.png"

    def test_channel_without_icon(self):
        """Channel element without icon sub-element gets empty icon."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <channel id="ch2.noicon">
    <display-name>No Icon Ch</display-name>
  </channel>
</tv>"""
        result = parse_xmltv(xml)
        assert result["channels"][0]["icon"] == ""

    def test_channel_without_display_name(self):
        """Channel with no display-name gets empty name."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <channel id="noname"/>
</tv>"""
        result = parse_xmltv(xml)
        assert result["channels"][0]["name"] == ""

    def test_single_programme_all_fields(self):
        """A programme with title, desc, icon, category, sub-title is fully parsed."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <programme start="20260101000000 +0000" stop="20260101010000 +0000" channel="ch1.example.com">
    <title>News at Ten</title>
    <sub-title>Evening Edition</sub-title>
    <desc>Tonight's top stories.</desc>
    <icon src="http://example.com/news.png"/>
    <category>News</category>
  </programme>
</tv>"""
        result = parse_xmltv(xml)
        assert len(result["programmes"]) == 1
        p = result["programmes"][0]
        assert p["channel"] == "ch1.example.com"
        assert p["start"] == "20260101000000 +0000"
        assert p["stop"] == "20260101010000 +0000"
        assert p["title"] == "News at Ten"
        assert p["subtitle"] == "Evening Edition"
        assert p["desc"] == "Tonight's top stories."
        assert p["icon"] == "http://example.com/news.png"
        assert p["category"] == "News"

    def test_programme_minimal_fields(self):
        """Programme with only required attributes still parses."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <programme start="20260101000000 +0000" stop="20260101010000 +0000" channel="ch1">
    <title>Minimal</title>
  </programme>
</tv>"""
        result = parse_xmltv(xml)
        p = result["programmes"][0]
        assert p["title"] == "Minimal"
        assert p["subtitle"] == ""
        assert p["desc"] == ""
        assert p["icon"] == ""
        assert p["category"] == ""

    def test_multiple_channels_and_programmes(self):
        """Multiple channels and programmes are all parsed."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <channel id="ch1"><display-name>Ch 1</display-name></channel>
  <channel id="ch2"><display-name>Ch 2</display-name></channel>
  <programme start="20260101000000 +0000" stop="20260101010000 +0000" channel="ch1">
    <title>Show 1</title>
  </programme>
  <programme start="20260101010000 +0000" stop="20260101020000 +0000" channel="ch2">
    <title>Show 2</title>
  </programme>
</tv>"""
        result = parse_xmltv(xml)
        assert len(result["channels"]) == 2
        assert len(result["programmes"]) == 2
        assert result["programmes"][0]["channel"] == "ch1"
        assert result["programmes"][1]["channel"] == "ch2"

    def test_malformed_xml_raises(self):
        """Invalid XML should raise an ElementTree ParseError."""
        from routes.guide_core import parse_xmltv

        with pytest.raises(Exception, match=".*"):
            parse_xmltv("this is not xml")

    def test_programme_icon_missing(self):
        """Programme without icon element gets empty icon string."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <programme start="20260101000000 +0000" stop="20260101010000 +0000" channel="c1">
    <title>Title</title>
  </programme>
</tv>"""
        result = parse_xmltv(xml)
        assert result["programmes"][0]["icon"] == ""

    def test_programme_category_missing(self):
        """Programme without category element gets empty category string."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <programme start="20260101000000 +0000" stop="20260101010000 +0000" channel="c1">
    <title>T</title>
  </programme>
</tv>"""
        result = parse_xmltv(xml)
        assert result["programmes"][0]["category"] == ""

    def test_display_name_with_extra_whitespace(self):
        """Extra whitespace in display-name should be normalized to single spaces."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <channel id="ch1">
    <display-name>  Channel   One  </display-name>
  </channel>
</tv>"""
        result = parse_xmltv(xml)
        assert result["channels"][0]["name"] == "Channel One"

    def test_multiple_display_names_uses_first(self):
        """If multiple display-name elements exist, their text is joined with space."""
        from routes.guide_core import parse_xmltv

        xml = """<?xml version="1.0" encoding="utf-8"?>
<tv>
  <channel id="ch1">
    <display-name>Channel</display-name>
    <display-name>Alternate</display-name>
  </channel>
</tv>"""
        result = parse_xmltv(xml)
        # findtext returns the first element's text
        assert result["channels"][0]["name"] == "Channel"
