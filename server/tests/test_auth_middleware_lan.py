"""Tests for the auth middleware LAN bypass gating (ALLOW_LAN_BYPASS).

The auth middleware (main.auth_middleware) has a dev convenience: requests
from localhost / private 192.168.x.x networks skip the X-Admin-Key /
X-Device-Token check for all /api/ endpoints. That bypass is gated by the
ALLOW_LAN_BYPASS config flag (default true for backward compat). These tests
verify the gate: disabled → LAN requests are NOT bypassed (401); enabled →
LAN requests pass through; non-LAN hosts are never bypassed.
"""

from fastapi.responses import Response
from starlette.requests import Request

# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _make_request(host: str, path: str = "/api/v1/live/categories") -> Request:
    """Build a minimal ASGI Request with the given client host."""
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [],
        "query_string": b"",
        "client": (host, 50000),
        "server": ("testserver", 80),
        "scheme": "http",
        "root_path": "",
    }
    return Request(scope)


async def _passthrough_call_next(request: Request) -> Response:
    """call_next stand-in — returns 200 so a bypass is observable."""
    return Response(status_code=200)


# ═══════════════════════════════════════════════════════════════════════════
# ALLOW_LAN_BYPASS gating
# ═══════════════════════════════════════════════════════════════════════════


class TestLanBypassGate:
    async def test_disabled_blocks_lan_request(self, monkeypatch):
        """ALLOW_LAN_BYPASS=false → 192.168.x.x request is NOT bypassed."""
        import config as cfg
        from main import auth_middleware

        monkeypatch.setattr(cfg, "ALLOW_LAN_BYPASS", False)
        resp = await auth_middleware(_make_request("192.168.1.50"), _passthrough_call_next)
        assert resp.status_code == 401  # auth required, not bypassed

    async def test_disabled_blocks_custom_lan_bypass_host(self, monkeypatch):
        """A host added via LAN_BYPASS_HOSTS is still gated when the flag is off."""
        import config as cfg
        from main import auth_middleware

        monkeypatch.setattr(cfg, "ALLOW_LAN_BYPASS", False)
        monkeypatch.setattr(cfg, "LAN_BYPASS_HOSTS", ("127.0.0.1", "::1", "localhost", "192.0.2.10"))
        resp = await auth_middleware(_make_request("192.0.2.10"), _passthrough_call_next)
        assert resp.status_code == 401

    async def test_disabled_blocks_localhost(self, monkeypatch):
        """ALLOW_LAN_BYPASS=false → 127.0.0.1 request is NOT bypassed."""
        import config as cfg
        from main import auth_middleware

        monkeypatch.setattr(cfg, "ALLOW_LAN_BYPASS", False)
        resp = await auth_middleware(_make_request("127.0.0.1"), _passthrough_call_next)
        assert resp.status_code == 401

    async def test_enabled_passes_lan_request(self, monkeypatch):
        """ALLOW_LAN_BYPASS=true (default) → LAN request passes through."""
        import config as cfg
        from main import auth_middleware

        monkeypatch.setattr(cfg, "ALLOW_LAN_BYPASS", True)
        resp = await auth_middleware(_make_request("192.168.1.50"), _passthrough_call_next)
        assert resp.status_code == 200  # bypassed

    async def test_enabled_passes_localhost(self, monkeypatch):
        """ALLOW_LAN_BYPASS=true → 127.0.0.1 request passes through."""
        import config as cfg
        from main import auth_middleware

        monkeypatch.setattr(cfg, "ALLOW_LAN_BYPASS", True)
        resp = await auth_middleware(_make_request("127.0.0.1"), _passthrough_call_next)
        assert resp.status_code == 200

    async def test_non_lan_host_never_bypassed(self, monkeypatch):
        """Public IPs are never bypassed even when ALLOW_LAN_BYPASS=true."""
        import config as cfg
        from main import auth_middleware

        monkeypatch.setattr(cfg, "ALLOW_LAN_BYPASS", True)
        resp = await auth_middleware(_make_request("8.8.8.8"), _passthrough_call_next)
        assert resp.status_code == 401  # auth still required

    async def test_default_flag_is_true(self):
        """Backward compat: default ALLOW_LAN_BYPASS is true."""
        from config import ALLOW_LAN_BYPASS

        assert ALLOW_LAN_BYPASS is True
