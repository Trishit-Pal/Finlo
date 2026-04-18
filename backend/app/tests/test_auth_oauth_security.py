from __future__ import annotations

import pytest

from app.api import auth as auth_api

pytestmark = pytest.mark.asyncio


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload
        self.headers: dict[str, str] = {}

    def json(self) -> dict:
        return self._payload

    async def aread(self) -> bytes:
        return b""


async def test_google_oauth_rejects_audience_mismatch(client, monkeypatch):
    monkeypatch.setattr(
        auth_api.settings, "OAUTH_GOOGLE_CLIENT_ID", "expected-client-id"
    )

    async def fake_http(_client, method, url, **_kwargs):
        assert method.upper() == "GET"
        assert "tokeninfo" in url
        return _FakeResponse(
            200,
            {
                "email": "google-user@example.com",
                "sub": "google-sub-123",
                "aud": "other-client-id",
                "name": "Google User",
            },
        )

    monkeypatch.setattr(auth_api, "http_request_with_retry", fake_http)

    resp = await client.post("/auth/oauth/google", json={"id_token": "fake-token"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Google token audience mismatch"


async def test_oauth_callback_requires_verified_supabase_identity(client, monkeypatch):
    monkeypatch.setattr(auth_api.settings, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(auth_api.settings, "SUPABASE_ANON_KEY", "anon-key")

    async def fake_http(_client, method, url, **kwargs):
        assert method.upper() == "GET"
        assert "/auth/v1/user" in url
        headers = kwargs.get("headers") or {}
        assert headers.get("Authorization") == "Bearer valid-access-token"
        return _FakeResponse(
            200,
            {
                "id": "supabase-user-1",
                "email": "verified@example.com",
                "app_metadata": {"provider": "google"},
                "user_metadata": {"name": "Verified User"},
            },
        )

    monkeypatch.setattr(auth_api, "http_request_with_retry", fake_http)

    mismatch = await client.post(
        "/auth/oauth/callback",
        json={
            "provider": "google",
            "access_token": "valid-access-token",
            "email": "attacker@example.com",
        },
    )
    assert mismatch.status_code == 401
    assert mismatch.json()["detail"] == "OAuth identity mismatch"

    good = await client.post(
        "/auth/oauth/callback",
        json={
            "provider": "google",
            "access_token": "valid-access-token",
            "email": "verified@example.com",
        },
    )
    assert good.status_code == 200
    body = good.json()
    assert body["user"]["email"] == "verified@example.com"
    assert body["access_token"]
