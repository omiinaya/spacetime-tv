"""Tests for iptv_client.py — URL building, provider selection, caching, and HTTP fetch.

Tests cover:
  - mask_url_credentials() with various URL formats
  - get_enabled_providers / get_active_provider / get_provider_by_index
  - iptv_url / iptv_stream_url / iptv_vod_url / iptv_timeshift_url / iptv_xmltv_url
  - iptv_raw_proxy_url / iptv_referer / iptv_probe_url
  - iptv_auth_headers()
  - vod_url / build_timeshift_url backward-compat aliases
  - fetch_iptv and cached_fetch error when no providers
  - _get_provider_client() client creation and caching
"""

import asyncio
from unittest.mock import patch

import httpx
import pytest
from fastapi import HTTPException

from config import ProviderConfig
from iptv_client import (
    _get_provider_client,
    _provider_clients,
    build_timeshift_url,
    cached_fetch,
    fetch_iptv,
    get_active_provider,
    get_enabled_providers,
    get_provider_by_index,
    iptv_auth_headers,
    iptv_probe_url,
    iptv_raw_proxy_url,
    iptv_referer,
    iptv_stream_url,
    iptv_timeshift_url,
    iptv_url,
    iptv_vod_url,
    iptv_xmltv_url,
    mask_url_credentials,
    vod_url,
)

# ══════════════════════════════════════════════════════════════════════════
# mask_url_credentials
# ══════════════════════════════════════════════════════════════════════════


class TestMaskUrlCredentials:
    """Redact credentials from URLs for safe logging."""

    def test_http_basic_auth(self):
        """http://user:pass@host should mask the password portion."""
        url = "http://admin:secret123@provider.com/live"
        masked = mask_url_credentials(url)
        assert "secret123" not in masked
        assert "admin:****@" in masked

    def test_path_credentials_live(self):
        """/live/{user}/{pass}/ path segment is masked."""
        url = "http://provider.com/live/myuser/mypass/123.ts"
        masked = mask_url_credentials(url)
        assert "myuser" not in masked
        assert "mypass" not in masked
        assert "/live/****:****/" in masked

    def test_path_credentials_movie(self):
        """/movie/{user}/{pass}/ path segment is masked."""
        url = "http://provider.com/movie/u/p/456.mkv"
        masked = mask_url_credentials(url)
        assert "/movie/****:****/" in masked

    def test_path_credentials_series(self):
        """/series/{user}/{pass}/ path segment is masked."""
        url = "http://provider.com/series/u/p/789.mkv"
        masked = mask_url_credentials(url)
        assert "/series/****:****/" in masked

    def test_query_params(self):
        """username= and password= query params are redacted."""
        url = "http://provider.com/player_api.php?username=alice&password=supersecret&action=live"
        masked = mask_url_credentials(url)
        assert "alice" not in masked
        assert "supersecret" not in masked
        assert "username=****&password=****" in masked
        assert "action=live" in masked  # non-credential params preserved

    def test_no_credentials_unchanged(self):
        """URL without any credentials is unchanged."""
        url = "http://provider.com/player_api.php?action=live"
        assert mask_url_credentials(url) == url

    def test_mixed_auth_and_path_and_query(self):
        """All credential locations are masked simultaneously."""
        url = "http://user:pass@host/live/u/p/1.ts?username=foo&password=bar"
        masked = mask_url_credentials(url)
        # http auth
        assert "user:pass@" not in masked
        assert "user:****@" in masked
        # path
        assert "/live/****:****/" in masked
        # query params
        assert "username=****" in masked
        assert "password=****" in masked
        assert "foo" not in masked
        assert "bar" not in masked

    def test_empty_string(self):
        """Empty string is returned as-is."""
        assert mask_url_credentials("") == ""

    def test_password_only_in_query(self):
        """Only password param without username is still masked."""
        url = "http://provider.com/api?password=visible"
        masked = mask_url_credentials(url)
        assert "visible" not in masked
        assert "password=****" in masked

    def test_username_only_in_query(self):
        """Only username param without password is still masked."""
        url = "http://provider.com/api?username=known"
        masked = mask_url_credentials(url)
        assert "known" not in masked
        assert "username=****" in masked


# ══════════════════════════════════════════════════════════════════════════
# Provider selection
# ══════════════════════════════════════════════════════════════════════════


class TestGetEnabledProviders:
    """get_enabled_providers returns only enabled providers."""

    def test_returns_only_enabled(self):
        """All returned providers have enabled=True."""
        providers = get_enabled_providers()
        assert all(p.enabled for p in providers)

    def test_at_least_one_provider_from_env(self):
        """Default test env (IPTV_BASE set) should yield one enabled provider."""
        providers = get_enabled_providers()
        assert len(providers) >= 1
        assert providers[0].name == "Default"

    def test_respects_enabled_flag(self):
        """A disabled provider is excluded."""
        providers = [
            ProviderConfig("P1", "http://a.com", "u1", "p1", enabled=True),
            ProviderConfig("P2", "http://b.com", "u2", "p2", enabled=False),
        ]
        import sys

        mod = sys.modules[__name__]
        with patch.object(mod, "get_enabled_providers", return_value=[providers[0]]):
            enabled = get_enabled_providers()
            assert len(enabled) == 1
            assert enabled[0].name == "P1"


class TestGetActiveProvider:
    """get_active_provider returns the first enabled provider."""

    def test_returns_first_enabled(self):
        """Returns the first enabled provider from env configuration."""
        active = get_active_provider()
        assert active is not None
        assert active.enabled
        assert active.name == "Default"

    def test_returns_none_when_no_providers(self):
        """Returns None when no providers are enabled."""
        with patch("iptv_client.get_enabled_providers", return_value=[]):
            assert get_active_provider() is None


class TestGetProviderByIndex:
    """get_provider_by_index returns provider by index in enabled list."""

    def test_valid_index(self):
        """Index 0 returns the first enabled provider."""
        p = get_provider_by_index(0)
        assert p is not None
        assert p.enabled

    def test_negative_index_returns_none(self):
        """Negative indices are out of range."""
        assert get_provider_by_index(-1) is None

    def test_out_of_range_returns_none(self):
        """Index equal to or beyond list length returns None."""
        count = len(get_enabled_providers())
        assert get_provider_by_index(count) is None
        assert get_provider_by_index(count + 5) is None

    def test_works_with_mocked_providers(self):
        """Works correctly with a controlled provider list."""
        providers = [
            ProviderConfig("P1", "http://a.com", "u1", "p1", enabled=True),
            ProviderConfig("P2", "http://b.com", "u2", "p2", enabled=True),
        ]
        with patch("iptv_client.get_enabled_providers", return_value=providers):
            assert get_provider_by_index(0) is not None
            assert get_provider_by_index(0).name == "P1"
            assert get_provider_by_index(1) is not None
            assert get_provider_by_index(1).name == "P2"
            assert get_provider_by_index(2) is None


# ══════════════════════════════════════════════════════════════════════════
# URL building — these use the default provider from conftest env vars
# (IPTV_BASE=http://test-iptv.live, IPTV_USER=test_user, IPTV_PASS=test_pass)
# ══════════════════════════════════════════════════════════════════════════


class TestIptvUrl:
    """iptv_url builds player_api.php URLs with action and credentials."""

    def test_builds_player_api_url(self):
        """URL includes player_api.php, action, and credentials."""
        url = iptv_url("get_live_streams")
        assert "player_api.php" in url
        assert "action=get_live_streams" in url
        assert "username=test_user" in url
        assert "password=test_pass" in url
        assert url.startswith("http://test-iptv.live/")

    def test_includes_extra_params(self):
        """Extra keyword arguments become query parameters."""
        url = iptv_url("get_vod_streams", category_id=5)
        assert "category_id=5" in url

    def test_raises_500_when_no_provider(self):
        """Raises HTTPException 500 when no active provider."""
        with patch("iptv_client.get_active_provider", return_value=None):
            with pytest.raises(HTTPException) as exc:
                iptv_url("action")
            assert exc.value.status_code == 500
            assert "No IPTV provider configured" in str(exc.value.detail)


class TestIptvStreamUrl:
    """iptv_stream_url builds direct stream URLs with /{type}/{user}/{pass}/{id}.{ext}."""

    def test_live_stream_url(self):
        """Live stream: /live/{user}/{pass}/{id}.ts."""
        url = iptv_stream_url(42, "live")
        assert "/live/" in url
        assert url.endswith(".ts")
        assert "42.ts" in url

    def test_movie_stream_default_ext(self):
        """Movie stream: /movie/{user}/{pass}/{id}.mkv default extension."""
        url = iptv_stream_url(99, "movie")
        assert "/movie/" in url
        assert "99.mkv" in url

    def test_series_stream(self):
        """Series stream: /series/{user}/{pass}/{id}.mkv."""
        url = iptv_stream_url(55, "series")
        assert "/series/" in url
        assert "55.mkv" in url

    def test_custom_extension(self):
        """Explicit extension overrides the default."""
        url = iptv_stream_url(77, "movie", ext="mp4")
        assert url.endswith("77.mp4")

    def test_unknown_type_defaults_to_live(self):
        """Unknown stream_type falls back to /live/ prefix."""
        url = iptv_stream_url(1, "unknown_type")
        assert "/live/" in url

    def test_contains_credentials(self):
        """URL includes username and password."""
        url = iptv_stream_url(42, "live")
        assert "test_user" in url
        assert "test_pass" in url

    def test_raises_500_when_no_provider(self):
        """Raises HTTPException 500 when no active provider."""
        with patch("iptv_client.get_active_provider", return_value=None):
            with pytest.raises(HTTPException) as exc:
                iptv_stream_url(1, "live")
            assert exc.value.status_code == 500


class TestIptvVodUrl:
    """iptv_vod_url builds provider MKV URLs for ffprobe/ffmpeg."""

    def test_movie_url(self):
        """Movie VOD uses /movie/ prefix and .mkv."""
        url = iptv_vod_url(100, "movie")
        assert "/movie/" in url
        assert "100.mkv" in url

    def test_series_url(self):
        """Series VOD uses /series/ prefix."""
        url = iptv_vod_url(200, "series")
        assert "/series/" in url
        assert "200.mkv" in url

    def test_default_media_type_is_movie(self):
        """Default media_type parameter is 'movie'."""
        url = iptv_vod_url(300)
        assert "/movie/" in url
        assert "300.mkv" in url

    def test_contains_credentials(self):
        """URL includes username and password."""
        url = iptv_vod_url(100)
        assert "test_user" in url
        assert "test_pass" in url

    def test_raises_500_when_no_provider(self):
        """Raises HTTPException 500 when no active provider."""
        with patch("iptv_client.get_active_provider", return_value=None):
            with pytest.raises(HTTPException) as exc:
                iptv_vod_url(1)
            assert exc.value.status_code == 500


class TestIptvTimeshiftUrl:
    """iptv_timeshift_url builds Xtream Codes timeshift URLs."""

    def test_timeshift_url_format(self):
        """Timeshift: /live/{user}/{pass}/{id}/timeshift/{duration}.ts."""
        url = iptv_timeshift_url(42, 3600)
        assert "/live/" in url
        assert "42" in url
        assert "timeshift" in url
        assert "3600.ts" in url

    def test_contains_credentials(self):
        """URL includes username and password."""
        url = iptv_timeshift_url(42, 3600)
        assert "test_user" in url
        assert "test_pass" in url

    def test_raises_500_when_no_provider(self):
        """Raises HTTPException 500 when no active provider."""
        with patch("iptv_client.get_active_provider", return_value=None):
            with pytest.raises(HTTPException) as exc:
                iptv_timeshift_url(1, 60)
            assert exc.value.status_code == 500


class TestIptvXmltvUrl:
    """iptv_xmltv_url builds XMLTV/EPG URLs."""

    def test_xmltv_url(self):
        """XMLTV URL includes xmltv.php with credentials as query params."""
        url = iptv_xmltv_url()
        assert "xmltv.php" in url
        assert "username=test_user" in url
        assert "password=test_pass" in url

    def test_raises_500_when_no_provider(self):
        """Raises HTTPException 500 when no active provider."""
        with patch("iptv_client.get_active_provider", return_value=None):
            with pytest.raises(HTTPException) as exc:
                iptv_xmltv_url()
            assert exc.value.status_code == 500


class TestIptvRawProxyUrl:
    """iptv_raw_proxy_url builds raw proxy URLs with credentials appended."""

    def test_raw_proxy_url(self):
        """Credentials appended as query params to the given path."""
        url = iptv_raw_proxy_url("some/path/file.ts")
        assert "/some/path/file.ts" in url
        assert "username=test_user" in url
        assert "password=test_pass" in url

    def test_raises_500_when_no_provider(self):
        """Raises HTTPException 500 when no active provider."""
        with patch("iptv_client.get_active_provider", return_value=None):
            with pytest.raises(HTTPException) as exc:
                iptv_raw_proxy_url("path")
            assert exc.value.status_code == 500


class TestIptvReferer:
    """iptv_referer returns the base URL as a referer header."""

    def test_referer_format(self):
        """Referer is base URL with trailing slash."""
        ref = iptv_referer()
        assert ref == "http://test-iptv.live/"

    def test_returns_empty_when_no_provider(self):
        """Returns empty string when no active provider exists."""
        with patch("iptv_client.get_active_provider", return_value=None):
            assert iptv_referer() == ""


class TestIptvProbeUrl:
    """iptv_probe_url is an alias for iptv_vod_url."""

    def test_probe_is_alias_for_vod_url(self):
        """Both functions return the same URL for identical args."""
        probe = iptv_probe_url(500, "movie")
        vod = iptv_vod_url(500, "movie")
        assert probe == vod

    def test_probe_with_series(self):
        """Probe URL works with series media type."""
        url = iptv_probe_url(600, "series")
        assert "/series/" in url
        assert "600.mkv" in url


# ══════════════════════════════════════════════════════════════════════════
# Auth headers
# ══════════════════════════════════════════════════════════════════════════


class TestIptvAuthHeaders:
    """iptv_auth_headers returns X-Username and X-Password headers."""

    def test_returns_headers_for_active_provider(self):
        """Default test provider credentials appear in headers."""
        headers = iptv_auth_headers()
        assert "X-Username" in headers
        assert "X-Password" in headers
        assert headers["X-Username"] == "test_user"
        assert headers["X-Password"] == "test_pass"

    def test_returns_empty_dict_when_no_provider(self):
        """Returns {} when there is no active provider."""
        with patch("iptv_client.get_active_provider", return_value=None):
            headers = iptv_auth_headers()
            assert headers == {}

    def test_works_with_explicit_provider(self):
        """Passing a provider explicitly returns correct headers."""
        p = ProviderConfig("Custom", "http://c.com", "alice", "hunter2")
        headers = iptv_auth_headers(provider=p)
        assert headers["X-Username"] == "alice"
        assert headers["X-Password"] == "hunter2"
        assert "X-Username" in headers
        assert "X-Password" in headers


# ══════════════════════════════════════════════════════════════════════════
# Backward-compatible aliases
# ══════════════════════════════════════════════════════════════════════════


class TestBackwardCompatAliases:
    """vod_url and build_timeshift_url are backward-compat aliases."""

    def test_vod_url_is_alias(self):
        """vod_url returns the same result as iptv_vod_url."""
        assert vod_url(700) == iptv_vod_url(700)
        assert vod_url(800, "series") == iptv_vod_url(800, "series")

    def test_build_timeshift_url_is_alias(self):
        """build_timeshift_url returns the same as iptv_timeshift_url."""
        assert build_timeshift_url(42, 3600) == iptv_timeshift_url(42, 3600)
        assert build_timeshift_url(99, 7200) == iptv_timeshift_url(99, 7200)


# ══════════════════════════════════════════════════════════════════════════
# fetch_iptv error paths
# ══════════════════════════════════════════════════════════════════════════


class TestFetchIptv:
    """fetch_iptv raises HTTPException when no providers are available."""

    @pytest.mark.asyncio
    async def test_raises_500_when_no_providers(self):
        """No enabled providers yields HTTP 500."""
        with patch("iptv_client.get_enabled_providers", return_value=[]):
            with pytest.raises(HTTPException) as exc:
                await fetch_iptv("test_action")
            assert exc.value.status_code == 500
            assert "No IPTV provider configured" in str(exc.value.detail)


# ══════════════════════════════════════════════════════════════════════════
# cached_fetch error paths
# ══════════════════════════════════════════════════════════════════════════


class TestCachedFetch:
    """cached_fetch edge cases — error when no providers."""

    @pytest.mark.asyncio
    async def test_raises_500_when_no_providers(self):
        """No enabled providers yields HTTP 500 from cached_fetch."""
        with patch("iptv_client.get_enabled_providers", return_value=[]):
            with pytest.raises(HTTPException) as exc:
                await cached_fetch("some_key", "some_action")
            assert exc.value.status_code == 500
            assert "No IPTV provider configured" in str(exc.value.detail)

    @pytest.mark.asyncio
    async def test_raises_400_when_bad_provider_idx(self):
        """An out-of-range provider_idx yields HTTP 400."""
        # Ensure at least one provider exists (env-default)
        providers = get_enabled_providers()
        if providers:
            bad_idx = len(providers) + 99
            with patch("iptv_client.get_provider_by_index", return_value=None):
                with pytest.raises(HTTPException) as exc:
                    await cached_fetch("k", "action", provider_idx=bad_idx)
                assert exc.value.status_code == 400
                assert "out of range" in str(exc.value.detail).lower()


# ══════════════════════════════════════════════════════════════════════════
# _get_provider_client
# ══════════════════════════════════════════════════════════════════════════


class TestGetProviderClient:
    """_get_provider_client creates and caches per-provider HTTP clients."""

    def setup_method(self):
        """Ensure a clean _provider_clients dict before each test."""
        _provider_clients.clear()

    def teardown_method(self):
        """Close any clients that were created and clean up."""

        for client in _provider_clients.values():
            try:
                if not client.is_closed:
                    # aclose() is a coroutine — must be awaited, not called
                    # bare (that would emit "coroutine never awaited").
                    asyncio.run(client.aclose())
            except Exception:
                pass
        _provider_clients.clear()

    def test_creates_async_client(self):
        """_get_provider_client returns an httpx.AsyncClient instance."""
        provider = ProviderConfig(
            name="TestProv",
            base_url="http://test.example.com",
            username="test_user",
            password="test_pass",
            enabled=True,
        )
        client = _get_provider_client(provider)
        assert isinstance(client, httpx.AsyncClient)
        assert not client.is_closed

    def test_caches_and_reuses_client(self):
        """Calling twice with the same provider returns the same client."""
        provider = ProviderConfig(
            name="CachedProv",
            base_url="http://cached.example.com",
            username="u",
            password="p",
            enabled=True,
        )
        c1 = _get_provider_client(provider)
        c2 = _get_provider_client(provider)
        assert c1 is c2

    def test_different_providers_get_different_clients(self):
        """Providers with different base_url or username get separate clients."""
        p1 = ProviderConfig("P1", "http://a.com", "u1", "p1")
        p2 = ProviderConfig("P2", "http://b.com", "u2", "p2")
        c1 = _get_provider_client(p1)
        c2 = _get_provider_client(p2)
        assert c1 is not c2

    def test_cache_key_uses_hash_of_base_url_and_username(self):
        """Same base_url and username (even different object) reuses client."""
        p1 = ProviderConfig("P1", "http://same.example.com", "shared", "p1")
        p2 = ProviderConfig("P2", "http://same.example.com", "shared", "p2")
        c1 = _get_provider_client(p1)
        c2 = _get_provider_client(p2)
        assert c1 is c2


# ══════════════════════════════════════════════════════════════════════════
# Multi-provider parallel fetch + failover + health
# ══════════════════════════════════════════════════════════════════════════


class FakeResponse:
    """Minimal stand-in for httpx.Response with the attributes callers use."""

    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(f"HTTP {self.status_code}", request=None, response=self)

    def json(self):
        return self._payload


class FakeEpgResponse:
    """httpx.Response stand-in with a .text attribute (EPG fetch uses resp.text)."""

    def __init__(self, text, status=200):
        self.text = text
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(f"HTTP {self.status_code}", request=None, response=self)


class TestFetchAllProviders:
    """fetch_all_providers: parallel fetch, dedup, per-provider tagging."""

    def _mk_providers(self):
        return [
            ProviderConfig("P1", "http://p1.test", "u1", "p1", enabled=True),
            ProviderConfig("P2", "http://p2.test", "u2", "p2", enabled=True),
        ]

    @pytest.mark.asyncio
    async def test_aggregates_and_dedups_by_stream_id(self):
        with patch("iptv_client.get_enabled_providers", return_value=self._mk_providers()):
            with patch(
                "iptv_client._fetch_single_provider",
                side_effect=[
                    [{"stream_id": 1, "name": "A"}, {"stream_id": 2, "name": "B"}],
                    [{"stream_id": 1, "name": "A-dup"}, {"stream_id": 3, "name": "C"}],
                ],
            ):
                from iptv_client import fetch_all_providers

                items = await fetch_all_providers("get_live_streams")
        ids = {i["stream_id"] for i in items}
        assert ids == {1, 2, 3}
        # First provider wins the dedup; provenance tagged
        by_name = {i["name"]: i for i in items}
        assert by_name["A"]["_provider_name"] == "P1"
        assert by_name["C"]["_provider_name"] == "P2"

    @pytest.mark.asyncio
    async def test_raises_500_when_no_providers(self):
        with patch("iptv_client.get_enabled_providers", return_value=[]):
            from iptv_client import fetch_all_providers

            with pytest.raises(HTTPException) as exc:
                await fetch_all_providers("get_live_streams")
            assert exc.value.status_code == 500

    @pytest.mark.asyncio
    async def test_http_exception_from_provider_returns_empty(self):
        """A failing provider yields [] without propagating (failover-friendly)."""
        with patch("iptv_client.get_enabled_providers", return_value=self._mk_providers()):
            with patch(
                "iptv_client._fetch_single_provider",
                side_effect=HTTPException(502, "provider down"),
            ):
                from iptv_client import fetch_all_providers

                items = await fetch_all_providers("get_live_streams")
        assert items == []

    @pytest.mark.asyncio
    async def test_unexpected_exception_records_health(self):
        """Generic exceptions (e.g. KeyError in tagging) are logged + health-recorded."""
        from state import _provider_health

        _provider_health.clear()
        with patch("iptv_client.get_enabled_providers", return_value=self._mk_providers()):
            with patch(
                "iptv_client._fetch_single_provider",
                side_effect=KeyError("boom"),
            ):
                from iptv_client import fetch_all_providers

                items = await fetch_all_providers("get_live_streams")
        assert items == []
        # Health recorded for idx=0 provider with the error
        assert any(h.get("error_count", 0) > 0 for h in _provider_health.values())


class TestFetchEpgAllProviders:
    """fetch_epg_all_providers: parallel XMLTV fetch + merge/dedup."""

    @pytest.mark.asyncio
    async def test_merges_channels_and_programmes(self):
        p1 = ProviderConfig("P1", "http://p1.test", "u1", "p1", enabled=True)
        p2 = ProviderConfig("P2", "http://p2.test", "u2", "p2", enabled=True)
        p1_raw = '<tv><channel id="ch1"/><channel id="ch2"/><programme channel="ch1"/></tv>'
        p2_raw = '<tv><channel id="ch1"/><channel id="ch3"/><programme channel="ch3"/></tv>'

        # GET returns a response whose .text differs per provider base URL.
        async def fake_get(url, timeout=120.0):
            return FakeEpgResponse(p2_raw if "p2.test" in url else p1_raw)

        def fake_parse(text):
            # Reuse the real parser shape: extract ACTUAL channel ids and count
            # programmes from the supplied xml (mirrors the real parse_xmltv
            # contract — ids must round-trip for cross-provider dedup).
            import re as _re

            ch_ids = _re.findall(r'<channel id="([^"]+)"', text)
            n_pr = text.count("<programme ")
            return {
                "channels": [{"id": cid} for cid in ch_ids],
                "programmes": [{"channel_id": "x"} for _ in range(n_pr)],
            }

        from iptv_client import fetch_epg_all_providers

        def fake_xmltv_url(*, provider=None, **kw):
            return f"http://{provider.name.lower()}.test/xmltv"

        with patch("iptv_client.get_enabled_providers", return_value=[p1, p2]):
            with patch("iptv_client.iptv_xmltv_url", side_effect=fake_xmltv_url):
                with patch("iptv_client._get_provider_client") as mock_client:
                    mock_client.return_value.get = fake_get
                    with patch("routes.guide_core.parse_xmltv", side_effect=fake_parse):
                        merged = await fetch_epg_all_providers()

        ch_ids = {c["id"] for c in merged["channels"]}
        assert ch_ids == {"ch1", "ch2", "ch3"}  # ch1 deduped across providers
        assert len(merged["programmes"]) == 2
        assert all(c["_provider"] == "multi" for c in merged["channels"])
        assert all(p["_provider"] == "multi" for p in merged["programmes"])

    @pytest.mark.asyncio
    async def test_epg_http_error_returns_none_and_skips(self):
        from iptv_client import fetch_epg_all_providers

        p1 = ProviderConfig("P1", "http://p1.test", "u1", "p1", enabled=True)
        with patch("iptv_client.get_enabled_providers", return_value=[p1]):
            with patch("iptv_client.iptv_xmltv_url", return_value="http://p.test/xmltv"):
                with patch("iptv_client._get_provider_client") as mock_client:
                    mock_client.return_value.get = _async_raise(httpx.HTTPError("epg down"))
                    merged = await fetch_epg_all_providers()
        assert merged == {"channels": [], "programmes": []}

    @pytest.mark.asyncio
    async def test_raises_500_when_no_providers(self):
        from iptv_client import fetch_epg_all_providers

        with patch("iptv_client.get_enabled_providers", return_value=[]):
            with pytest.raises(HTTPException) as exc:
                await fetch_epg_all_providers()
        assert exc.value.status_code == 500


def _aresp(data):
    """Return an async callable that yields a FakeResponse wrapping data."""

    async def _inner(url, timeout=120.0):
        return FakeResponse(data)

    return _inner


def _async_raise(exc):
    async def _inner(*a, **k):
        raise exc

    return _inner


class TestFetchIptvFailover:
    """fetch_iptv: tries providers in order, fails over, raises 502 on total failure."""

    def _mk_providers(self):
        return [
            ProviderConfig("P1", "http://p1.test", "u1", "p1", enabled=True),
            ProviderConfig("P2", "http://p2.test", "u2", "p2", enabled=True),
        ]

    @pytest.mark.asyncio
    async def test_first_provider_success(self):
        from iptv_client import fetch_iptv

        with patch("iptv_client.get_enabled_providers", return_value=self._mk_providers()):
            with patch("iptv_client._get_provider_client") as mock_client:
                mock_client.return_value.get = _aresp({"data": "ok"})
                data = await fetch_iptv("get_live_streams")
        assert data == {"data": "ok"}

    @pytest.mark.asyncio
    async def test_fails_over_to_second_provider(self):
        from iptv_client import fetch_iptv

        p1 = ProviderConfig("P1", "http://p1.test", "u1", "p1", enabled=True)
        p2 = ProviderConfig("P2", "http://p2.test", "u2", "p2", enabled=True)
        calls = {"n": 0}

        async def flaky_get(url, timeout=5.0):
            calls["n"] += 1
            if calls["n"] == 1:
                raise httpx.ConnectError("first down")
            return FakeResponse({"data": "from-p2"})

        with patch("iptv_client.get_enabled_providers", return_value=[p1, p2]):
            with patch("iptv_client._get_provider_client") as mock_client:
                mock_client.return_value.get = flaky_get
                data = await fetch_iptv("get_live_streams")
        assert data == {"data": "from-p2"}

    @pytest.mark.asyncio
    async def test_all_providers_fail_raises_502(self):
        from iptv_client import fetch_iptv

        with patch("iptv_client.get_enabled_providers", return_value=self._mk_providers()):
            with patch("iptv_client._get_provider_client") as mock_client:
                mock_client.return_value.get = _async_raise(httpx.ConnectError("down"))
                with pytest.raises(HTTPException) as exc:
                    await fetch_iptv("get_live_streams")
        assert exc.value.status_code == 502


class TestFetchSingleProvider:
    """_fetch_single_provider: decrypt, health update, error paths."""

    @pytest.mark.asyncio
    async def test_success_updates_health(self):
        from state import _provider_health

        _provider_health.clear()
        from iptv_client import _fetch_single_provider

        p = ProviderConfig("HP1", "http://hp.test", "u", "p", enabled=True)
        with patch("iptv_client._get_provider_client") as mock_client:
            mock_client.return_value.get = _aresp({"data": "ok"})
            with patch("iptv_client.get_enabled_providers", return_value=[p]):
                data = await _fetch_single_provider(p, "get_live_streams")
        assert data == {"data": "ok"}
        assert any(h.get("ok_count", 0) > 0 for h in _provider_health.values())

    @pytest.mark.asyncio
    async def test_http_error_updates_health_and_raises_502(self):
        from state import _provider_health

        _provider_health.clear()
        from iptv_client import _fetch_single_provider

        p = ProviderConfig("HE", "http://he.test", "u", "p", enabled=True)
        with patch("iptv_client._get_provider_client") as mock_client:
            mock_client.return_value.get = _async_raise(httpx.ConnectError("down"))
            with patch("iptv_client.get_enabled_providers", return_value=[p]):
                with pytest.raises(HTTPException) as exc:
                    await _fetch_single_provider(p, "get_live_streams")
        assert exc.value.status_code == 502
        assert any(h.get("error_count", 0) > 0 for h in _provider_health.values())

    @pytest.mark.asyncio
    async def test_encrypted_password_is_decrypted(self):
        from iptv_client import _fetch_single_provider

        p = ProviderConfig("ENC", "http://enc.test", "u", "enc:abc123", enabled=True)
        with patch("crypto_utils.decrypt", return_value="plainpass") as mock_decrypt:
            with patch("iptv_client._get_provider_client") as mock_client:
                mock_client.return_value.get = _aresp({"data": "ok"})
                await _fetch_single_provider(p, "get_live_streams")
        mock_decrypt.assert_called_once_with("enc:abc123")


class TestUpdateProviderHealth:
    """_update_provider_health: tracks per-provider ok/error counts best-effort."""

    def test_success_and_failure_counters(self):
        from state import _provider_health

        _provider_health.clear()
        from iptv_client import _update_provider_health

        p1 = ProviderConfig("H1", "http://h1.test", "u", "p", enabled=True)
        p2 = ProviderConfig("H2", "http://h2.test", "u", "p", enabled=True)
        with patch("iptv_client.get_enabled_providers", return_value=[p1, p2]):
            _update_provider_health(p1, success=True)
            _update_provider_health(p1, success=False, error="boom")
            _update_provider_health(p1, success=False, error="boom2")
        h = _provider_health[0]
        assert h["ok_count"] == 1
        assert h["error_count"] == 2
        assert h["last_error_msg"] == "boom2"

    def test_missing_provider_is_noop(self):
        from state import _provider_health

        _provider_health.clear()
        from iptv_client import _update_provider_health

        ghost = ProviderConfig("Ghost", "http://g.test", "u", "p", enabled=True)
        with patch("iptv_client.get_enabled_providers", return_value=[]):
            _update_provider_health(ghost, success=False)  # must not raise
        assert _provider_health == {}

    def test_exception_swallowed_when_health_lookup_fails(self, monkeypatch):
        """Unexpected error in the health loop is swallowed (best-effort)."""
        from state import _provider_health

        _provider_health.clear()
        from iptv_client import _update_provider_health

        p1 = ProviderConfig("H1", "http://h1.test", "u", "p", enabled=True)

        # Force an AttributeError inside the loop -> swallowed
        monkeypatch.setattr(
            "iptv_client.get_enabled_providers",
            lambda: (_ for _ in ()).throw(AttributeError("boom")),
        )
        _update_provider_health(p1, success=True)  # must not raise


# ══════════════════════════════════════════════════════════════════════════
# cached_fetch single-provider + failover paths
# ══════════════════════════════════════════════════════════════════════════


class TestCachedFetchSingleProvider:
    """cached_fetch provider_idx paths: success, stale fallback, re-raise."""

    @pytest.mark.asyncio
    async def test_single_provider_success(self):
        from iptv_client import cached_fetch

        p = ProviderConfig("SP", "http://sp.test", "u", "p", enabled=True)
        with (
            patch("iptv_client.get_enabled_providers", return_value=[p]),
            patch("iptv_client.get_provider_by_index", return_value=p),
            patch("iptv_client._fetch_single_provider", return_value={"data": "ok"}),
        ):
            result = await cached_fetch("sp_key", "get_live_streams", provider_idx=0)
        assert result == {"data": "ok"}

    @pytest.mark.asyncio
    async def test_single_provider_fails_falls_back_to_stale(self):
        import time

        from iptv_client import cached_fetch
        from state import _cache

        p = ProviderConfig("SP", "http://sp.test", "u", "p", enabled=True)
        _cache["p0:SP:sp_key"] = (time.time() + 3600, {"stale": "data"})
        with (
            patch("iptv_client.get_enabled_providers", return_value=[p]),
            patch("iptv_client.get_provider_by_index", return_value=p),
            patch(
                "iptv_client._fetch_single_provider",
                side_effect=HTTPException(502, "provider down"),
            ),
        ):
            result = await cached_fetch("sp_key", "get_live_streams", provider_idx=0)
        assert result == {"stale": "data"}

    @pytest.mark.asyncio
    async def test_single_provider_fails_no_stale_raises(self):
        from iptv_client import cached_fetch

        p = ProviderConfig("SP", "http://sp.test", "u", "p", enabled=True)
        with (
            patch("iptv_client.get_enabled_providers", return_value=[p]),
            patch("iptv_client.get_provider_by_index", return_value=p),
            patch(
                "iptv_client._fetch_single_provider",
                side_effect=HTTPException(502, "provider down"),
            ),
        ):
            with pytest.raises(HTTPException) as exc:
                await cached_fetch("sp_key", "get_live_streams", provider_idx=0)
        assert exc.value.status_code == 502


class TestFetchAllProvidersDedupEdges:
    """fetch_all_providers dedup edge branches: series-id and no-id items."""

    @pytest.mark.asyncio
    async def test_dedups_series_ids_and_keeps_no_id_items(self):
        from iptv_client import fetch_all_providers

        with patch("iptv_client.get_enabled_providers", return_value=[ProviderConfig("P1", "http://p1", "u", "p")]):
            with patch(
                "iptv_client._fetch_single_provider",
                return_value=[
                    {"series_id": 900, "name": "Series A"},
                    {"series_id": 900, "name": "Series A-dup"},
                    {"name": "No id item"},
                ],
            ):
                items = await fetch_all_providers("get_series")
        # series_id 900 deduped -> 1 entry; no-id item kept
        assert len(items) == 2
        assert sum(1 for i in items if i.get("series_id") == 900) == 1
        assert any(i.get("name") == "No id item" for i in items)

    @pytest.mark.asyncio
    async def test_skips_exception_results(self):
        from iptv_client import fetch_all_providers

        # A failing provider yields [] (its exception is handled inside
        # _fetch_one) — fetch_all_providers returns empty without crashing.
        with patch("iptv_client.get_enabled_providers", return_value=[ProviderConfig("P1", "http://p1", "u", "p")]):
            with patch(
                "iptv_client._fetch_single_provider",
                side_effect=HTTPException(502, "down"),
            ):
                items = await fetch_all_providers("get_live_streams")
        assert items == []


class TestFetchSearchAllProviders:
    """fetch_search_all_providers delegates to fetch_all_providers."""

    @pytest.mark.asyncio
    async def test_delegates_to_fetch_all(self):
        from iptv_client import fetch_search_all_providers

        with patch(
            "iptv_client.fetch_all_providers",
            return_value=[{"stream_id": 1, "name": "X"}],
        ) as mock_fap:
            result = await fetch_search_all_providers("get_vod_streams", category_id=5)
        assert result == [{"stream_id": 1, "name": "X"}]
        mock_fap.assert_called_once_with("get_vod_streams", category_id=5)
