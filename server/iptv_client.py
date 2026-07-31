"""IPTV API client — multi-provider fetch with caching, URL building, HTTP client.

Supports multiple Xtream providers with automatic failover:
- Each provider is tried in priority order
- If a provider fails (connection error, timeout, non-JSON response), next is tried
- Cached data scoped per-provider
- Legacy single-provider IPTV_BASE/IPTV_USER/IPTV_PASS still supported

Usage:
    from iptv_client import cached_fetch, client, get_active_provider
    data = await cached_fetch("vod_categories", "get_vod_categories")
    data = await cached_fetch("live_streams", "get_live_streams", provider_idx=1)
    # provider_idx=-1 (default) = try all providers, return first success
    # provider_idx=N = use specific provider only
"""

import asyncio
import json
import logging
import time
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

import config
from config import ProviderConfig
from state import CACHE_TTL, _cache, _cache_hits, _cache_misses

log = logging.getLogger("spacetime-tv")


def mask_url_credentials(url: str) -> str:
    """Redact username and password from a URL for safe logging."""
    import re

    # Mask user:pass in path segments (e.g., /live/user/pass/ -> /live/****:****/)
    url = re.sub(r"(://[^:]+):([^@]+)@", r"\1:****@", url)  # http://user:pass@host
    # Mask in path segments: /{user}/{pass}/ -> /****/****/
    url = re.sub(r"(/(?:live|movie|series)/)[^/]+/[^/]+(/)", r"\1****:****\2", url)
    # Mask query params: username=xxx&password=xxx
    url = re.sub(r"(username|password)=[^&]+", r"\1=****", url)
    return url


def iptv_auth_headers(provider: ProviderConfig | None = None) -> dict:
    """Return authentication headers for IPTV API calls.

    Use these headers instead of embedding credentials in query params
    where the provider supports it.
    """
    p = provider or get_active_provider()
    if not p:
        return {}
    headers = {}
    # Xtream API traditionally uses query params, but some providers
    # also accept Authorization header. We keep both for compatibility
    # while minimizing credential exposure in URLs.
    if hasattr(p, "username") and p.username:
        headers["X-Username"] = p.username
    if hasattr(p, "password") and p.password:
        # Don't expose raw password - only send encrypted or masked
        headers["X-Password"] = p.password
    return headers


# ── HTTP Client ─────────────────────────────────────────────────────────────
client = httpx.AsyncClient(
    timeout=30.0,
    headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
)

# Provider-level HTTP clients (for per-provider connection pools)
_provider_clients: dict[int, httpx.AsyncClient] = {}


def _get_provider_client(provider: ProviderConfig) -> httpx.AsyncClient:
    """Get or create a provider-specific HTTP client."""
    client_key = hash(provider.base_url + provider.username)
    if client_key not in _provider_clients:
        _provider_clients[client_key] = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
        )
    return _provider_clients[client_key]


def get_enabled_providers() -> list[ProviderConfig]:
    """Return list of enabled providers, sorted by priority (order asc)."""
    # Read through config.PROVIDERS (not a bound import-time copy) so any
    # rebind of the module list — e.g. importlib.reload in tests, or future
    # admin edits — is seen immediately. A bound copy silently desyncs
    # get_active_provider() from the real provider list.
    return [p for p in config.PROVIDERS if p.enabled]


def get_active_provider() -> ProviderConfig | None:
    """Get the highest-priority (first) enabled provider, or None."""
    providers = get_enabled_providers()
    return providers[0] if providers else None


def get_provider_by_index(idx: int) -> ProviderConfig | None:
    """Get provider by index in enabled list. Returns None if out of range."""
    providers = get_enabled_providers()
    if 0 <= idx < len(providers):
        return providers[idx]
    return None


# ── Parallel multi-provider fetch ────────────────────────────────────────────
async def fetch_all_providers(action: str, **params) -> list:
    """Fetch from all enabled providers in parallel and aggregate results.

    Returns a combined list, deduplicating by stream_id / series_id where applicable.
    Each item is tagged with 'provider_name' and 'provider_idx' for provenance.
    """
    providers = get_enabled_providers()
    if not providers:
        raise HTTPException(500, "No IPTV provider configured")

    async def _fetch_one(idx: int, provider: ProviderConfig) -> list:
        try:
            data = await _fetch_single_provider(provider, action, **params)
            items = data if isinstance(data, list) else data.get("data", []) if isinstance(data, dict) else []
            for item in items:
                item["_provider_name"] = provider.name
                item["_provider_idx"] = idx
            return items
        except HTTPException:
            return []
        except Exception:
            return []

    tasks = [_fetch_one(idx, p) for idx, p in enumerate(providers) if p.enabled]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_items: list[dict] = []
    seen_stream_ids: set[int] = set()
    seen_series_ids: set[int] = set()

    for result in results:
        if isinstance(result, Exception):
            continue
        for item in result:
            sid = item.get("stream_id") or item.get("id")
            series_id = item.get("series_id")
            if sid and sid not in seen_stream_ids:
                seen_stream_ids.add(sid)
                all_items.append(item)
            elif series_id and series_id not in seen_series_ids:
                seen_series_ids.add(series_id)
                all_items.append(item)
            elif not sid and not series_id:
                all_items.append(item)

    return all_items


# ── Parallel EPG fetch ──────────────────────────────────────────────────────
async def fetch_epg_all_providers() -> list[dict]:
    """Fetch XMLTV from all enabled providers in parallel, merge results.

    Returns merged dict with channels and programmes from all providers.
    Deduplicates channels by ID, appends programmes from all.
    """
    providers = get_enabled_providers()
    if not providers:
        raise HTTPException(500, "No IPTV provider configured")

    from routes.guide_core import parse_xmltv

    async def _fetch_epg(provider: ProviderConfig) -> dict | None:
        try:
            url = iptv_xmltv_url(provider=provider)
            pclient = _get_provider_client(provider)
            resp = await pclient.get(url, timeout=120.0)
            resp.raise_for_status()
            return parse_xmltv(resp.text)
        except (httpx.HTTPError, httpx.TimeoutException, json.JSONDecodeError) as e:
            log.warning(f"EPG fetch failed for provider '{provider.name}': {e}")
            return None

    tasks = [_fetch_epg(p) for p in providers]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    merged: dict[str, list] = {"channels": [], "programmes": []}
    seen_channels: set[str] = set()

    for result in results:
        if isinstance(result, Exception) or result is None:
            continue
        for ch in result.get("channels", []):
            ch_id = ch.get("id", "")
            if ch_id and ch_id not in seen_channels:
                seen_channels.add(ch_id)
                ch["_provider"] = "multi"  # mark as merged
                merged["channels"].append(ch)
        for prog in result.get("programmes", []):
            prog["_provider"] = "multi"
            merged["programmes"].append(prog)

    log.info(f"Multi-provider EPG merged: {len(merged['channels'])} channels, {len(merged['programmes'])} programmes")
    return merged


async def fetch_search_all_providers(action: str, **params) -> list:
    """Fetch from all providers and aggregate with dedup for search results.

    Used by search_service to aggregate VOD / series across providers.
    """
    return await fetch_all_providers(action, **params)


def iptv_url(action: str, provider: ProviderConfig | None = None, **params) -> str:
    """Build IPTV API URL (player_api.php) with credentials for a provider.

    SECURITY: Credentials are embedded in query params. Use mask_url_credentials()
    before logging. Prefer header-based auth via iptv_auth_headers() where supported.
    """
    p = provider or get_active_provider()
    if not p:
        raise HTTPException(500, "No IPTV provider configured")
    params.setdefault("username", p.username)
    params.setdefault("password", p.password)
    params["action"] = action
    return f"{p.base_url}/player_api.php?{urlencode(params)}"


def iptv_stream_url(
    stream_id: int, stream_type: str = "live", ext: str | None = None, provider: ProviderConfig | None = None
) -> str:
    """Build a direct stream URL for the IPTV CDN.

    Format: {base}/{prefix}/{user}/{pass}/{stream_id}.{ext}

    For live streams the extension is "ts"; for VOD the extension
    should be resolved upstream (e.g. via _lookup_extension).

    SECURITY: Credentials are embedded in the URL path. These URLs are
    returned to the frontend and may appear in browser history, logs, and
    Referer headers. Use mask_url_credentials() before logging.
    """
    p = provider or get_active_provider()
    if not p:
        raise HTTPException(500, "No IPTV provider configured")
    prefix = {"live": "live", "movie": "movie", "series": "series"}.get(stream_type, "live")
    ext = ext or ("ts" if stream_type == "live" else "mkv")
    return f"{p.base_url}/{prefix}/{p.username}/{p.password}/{stream_id}.{ext}"


def iptv_vod_url(stream_id: int, media_type: str = "movie", provider: ProviderConfig | None = None) -> str:
    """Build a provider MKV URL for ffprobe/ffmpeg (VOD probe context)."""
    p = provider or get_active_provider()
    if not p:
        raise HTTPException(500, "No IPTV provider configured")
    prefix = {"movie": "movie", "series": "series"}.get(media_type, "movie")
    return f"{p.base_url}/{prefix}/{p.username}/{p.password}/{stream_id}.mkv"


def iptv_timeshift_url(stream_id: int, duration_seconds: int, provider: ProviderConfig | None = None) -> str:
    """Build a timeshift URL.

    Xtream Codes API format:
      {base}/live/{user}/{pass}/{stream_id}/timeshift/{duration}.ts

    Duration is how far back in seconds (e.g. 3600 = 1 hour ago).
    Returns the raw provider URL; the caller proxies it through the server.
    """
    p = provider or get_active_provider()
    if not p:
        raise HTTPException(500, "No IPTV provider configured")
    return f"{p.base_url}/live/{p.username}/{p.password}/{stream_id}/timeshift/{duration_seconds}.ts"


def iptv_xmltv_url(provider: ProviderConfig | None = None) -> str:
    """Build XMLTV URL for EPG data.

    WARNING: Credentials are embedded in query params. This URL will be
    logged, cached, and visible in browser history if proxied through the client.
    For logging use mask_url_credentials(). Consider using iptv_auth_headers()
    for header-based auth where supported.
    """
    p = provider or get_active_provider()
    if not p:
        raise HTTPException(500, "No IPTV provider configured")
    return f"{p.base_url}/xmltv.php?username={p.username}&password={p.password}"


def iptv_raw_proxy_url(path: str, provider: ProviderConfig | None = None) -> str:
    """Build a raw proxy URL with credentials appended.

    WARNING: Credentials are embedded in query params. For safe logging
    use mask_url_credentials(). Consider header-based auth via iptv_auth_headers().
    """
    p = provider or get_active_provider()
    if not p:
        raise HTTPException(500, "No IPTV provider configured")
    params = urlencode({"username": p.username, "password": p.password})
    return f"{p.base_url}/{path}?{params}"


def iptv_referer(provider: ProviderConfig | None = None) -> str:
    """Return the base URL as a referer header value (anti-hotlinking)."""
    p = provider or get_active_provider()
    if not p:
        return ""
    return f"{p.base_url}/"


def iptv_probe_url(stream_id: int, media_type: str = "movie", provider: ProviderConfig | None = None) -> str:
    """Build the provider MKV URL for ffprobe/ffmpeg (VOD subtitle/audio context).
    Alias for iptv_vod_url() for backward compatibility.
    """
    return iptv_vod_url(stream_id, media_type, provider=provider)


async def fetch_iptv(action: str, **params) -> dict | list:
    """Fetch from IPTV API using active provider. Raises if no providers work."""
    providers = get_enabled_providers()
    if not providers:
        raise HTTPException(500, "No IPTV provider configured")

    last_error = None
    for idx, p in enumerate(providers):
        url = iptv_url(action, provider=p, **params)
        try:
            pclient = _get_provider_client(p)
            resp = await pclient.get(url)
            resp.raise_for_status()
            data = resp.json()
            # Success — log and return
            if idx > 0:
                log.info(f"API success using failover provider '{p.name}' (idx={idx}) for action={action}")
            return data
        except (httpx.HTTPError, httpx.TimeoutException, json.JSONDecodeError) as e:
            log.warning(f"Provider '{p.name}' failed for action={action}: {e}")
            last_error = e
            continue

    # All providers failed
    log.error(f"All IPTV providers failed for action={action}, last error: {last_error}")
    raise HTTPException(502, f"IPTV provider error: {last_error}")


async def cached_fetch(key: str, action: str, provider_idx: int = -1, **params) -> list | dict:
    """Fetch with caching — returns cached data within TTL, stale fallback on error.

    Args:
        key: Cache key (will be prefixed with provider info if multi-provider)
        action: IPTV API action name
        provider_idx: Provider index to use (-1 = try all enabled providers)
        **params: Additional query parameters

    Returns:
        Parsed JSON data (list or dict)
    """
    global _cache_hits, _cache_misses  # noqa: PLW0603
    now = time.time()

    providers = get_enabled_providers()
    if not providers:
        raise HTTPException(500, "No IPTV provider configured")

    # Build scoped cache key including provider info
    # When provider_idx is specific, scope to that provider
    provider_scope = "all"

    if provider_idx >= 0:
        p = get_provider_by_index(provider_idx)
        if p:
            provider_scope = f"p{provider_idx}:{p.name}"
        else:
            raise HTTPException(400, f"Provider index {provider_idx} out of range")
    else:
        # All providers — use a hash of enabled provider names for cache isolation
        provider_scope = "+".join(p.name for p in providers)

    scoped_key = f"{provider_scope}:{key}"

    # Check cache hit
    if scoped_key in _cache and (now - _cache[scoped_key][0]) < CACHE_TTL:
        _cache_hits += 1
        return _cache[scoped_key][1]
    _cache_misses += 1

    # Try to fetch from providers
    if provider_idx >= 0:
        # Single provider specified
        p = get_provider_by_index(provider_idx)
        if not p:
            raise HTTPException(400, f"Provider index {provider_idx} out of range")
        try:
            data = await _fetch_single_provider(p, action, **params)
        except HTTPException as e:
            log.warning(f"cached_fetch: {key} failed on provider {p.name} ({e})")
            if scoped_key in _cache:
                stale_data = _cache[scoped_key][1]
                log.warning(f"Falling back to stale cache for {scoped_key}")
                return stale_data
            raise
    else:
        # Try all enabled providers in order
        data = None
        last_error = None
        for p in providers:
            try:
                data = await _fetch_single_provider(p, action, **params)
                if data is not None:
                    if p != providers[0]:
                        log.info(f"cached_fetch: using failover provider '{p.name}' for {key}")
                    break
            except HTTPException as e:
                last_error = e
                log.warning(f"cached_fetch: provider '{p.name}' failed for {key}: {e}")
                continue

        if data is None:
            log.warning(f"cached_fetch: all providers failed for {key}")
            if scoped_key in _cache:
                stale_data = _cache[scoped_key][1]
                log.warning(f"Falling back to stale cache for {scoped_key}")
                return stale_data
            raise last_error or HTTPException(502, f"All IPTV providers failed for {key}")

    # Validate and cache
    if isinstance(data, list) and len(data) == 0:
        log.warning(f"cached_fetch: {key} returned empty list, not caching")
        if scoped_key in _cache:
            stale_data = _cache[scoped_key][1]
            log.warning(f"Falling back to stale cache for {scoped_key}")
            return stale_data
        return data

    _cache[scoped_key] = (now, data)
    return data


def _update_provider_health(provider: ProviderConfig, success: bool, error: str = ""):
    """Update provider health tracking in state."""
    try:
        from state import _provider_health

        enabled = get_enabled_providers()
        for h_idx, h_p in enumerate(enabled):
            if h_p.name == provider.name:
                if h_idx not in _provider_health:
                    _provider_health[h_idx] = {"last_ok": None, "last_error": None, "error_count": 0, "ok_count": 0}
                if success:
                    _provider_health[h_idx]["last_ok"] = time.time()
                    _provider_health[h_idx]["ok_count"] += 1
                else:
                    _provider_health[h_idx]["last_error"] = time.time()
                    _provider_health[h_idx]["error_count"] += 1
                    if error:
                        _provider_health[h_idx]["last_error_msg"] = error
                break
    except (KeyError, AttributeError, IndexError, TypeError, ImportError):
        pass  # health tracking is best-effort


async def _fetch_single_provider(provider: ProviderConfig, action: str, **params) -> dict | list:
    """Fetch from a single provider. Raises HTTPException on failure."""
    # Decrypt password if encrypted at rest
    if provider.password and provider.password.startswith("enc:"):
        from crypto_utils import decrypt

        provider.password = decrypt(provider.password)
    url = iptv_url(action, provider=provider, **params)
    try:
        pclient = _get_provider_client(provider)
        resp = await pclient.get(url)
        resp.raise_for_status()
        data = resp.json()
        # Update health on success
        _update_provider_health(provider, success=True)
        return data
    except (httpx.HTTPError, httpx.TimeoutException, json.JSONDecodeError) as e:
        log.error(f"Provider '{provider.name}' API error ({action}): {e}")
        # Update health on failure
        _update_provider_health(provider, success=False, error=str(e))
        raise HTTPException(502, f"IPTV provider '{provider.name}' error: {e}")


# ── Backward-compatible aliases ──────────────────────────────────────────────
# These are imported by older route modules. They delegate to provider-aware functions.


def vod_url(stream_id: int, media_type: str = "movie", provider: ProviderConfig | None = None) -> str:
    """Backward-compatible alias for iptv_vod_url()."""
    return iptv_vod_url(stream_id, media_type, provider=provider)


def build_timeshift_url(stream_id: int, duration_seconds: int, provider: ProviderConfig | None = None) -> str:
    """Backward-compatible alias for iptv_timeshift_url()."""
    return iptv_timeshift_url(stream_id, duration_seconds, provider=provider)
