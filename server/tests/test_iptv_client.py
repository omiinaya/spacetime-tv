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
