"""Supabase(PostgREST) RowStore 어댑터 — httpx로 room_state 한 행(JSONB)을 select/upsert.

state.SupabaseStateStore에 주입한다. 추가 패키지 없이 httpx만 쓴다(kakao 클라이언트와 동일 방식).
테스트는 httpx.MockTransport로 네트워크 없이 검증한다.

필요한 테이블(사용자 Supabase에서 1회 생성):
    create table if not exists room_state (
      room_id text primary key,
      data jsonb not null,
      updated_at timestamptz default now()
    );
"""

from __future__ import annotations

import os

import httpx


class SupabaseError(RuntimeError):
    pass


class SupabaseRowStore:
    """room_state(room_id -> data jsonb) 접근의 PostgREST 구현. state.RowStore 프로토콜 충족."""

    def __init__(self, base_url: str, api_key: str, *, client: httpx.AsyncClient | None = None):
        self._base = base_url.rstrip("/")
        self._key = api_key
        self._client = client
        self._table = f"{self._base}/rest/v1/room_state"

    def _headers(self, extra: dict | None = None) -> dict:
        h = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
        }
        if extra:
            h.update(extra)
        return h

    async def _request(self, method: str, url: str, **kw) -> httpx.Response:
        if self._client is not None:
            return await self._client.request(method, url, **kw)
        async with httpx.AsyncClient(timeout=10) as client:
            return await client.request(method, url, **kw)

    async def get(self, room_id: str) -> dict | None:
        resp = await self._request(
            "GET",
            self._table,
            params={"room_id": f"eq.{room_id}", "select": "data"},
            headers=self._headers(),
        )
        if resp.status_code >= 400:
            raise SupabaseError(f"select 실패({resp.status_code}): {resp.text[:200]}")
        rows = resp.json()
        return rows[0]["data"] if rows else None

    async def upsert(self, room_id: str, data: dict) -> None:
        resp = await self._request(
            "POST",
            self._table,
            params={"on_conflict": "room_id"},
            headers=self._headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
            json={"room_id": room_id, "data": data},
        )
        if resp.status_code >= 400:
            raise SupabaseError(f"upsert 실패({resp.status_code}): {resp.text[:200]}")

    @classmethod
    def from_env(cls) -> "SupabaseRowStore":
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise SupabaseError("SUPABASE_URL / SUPABASE_KEY가 설정되지 않았습니다.")
        return cls(url, key)


class SupabaseMessageStore:
    """채팅 메시지 append-only 저장(PostgREST). messages.MessageStore 프로토콜 충족.

    필요한 테이블:
        create table if not exists room_message (
          id bigserial primary key, room_id text not null, data jsonb not null,
          created_at timestamptz default now()
        );
        create index if not exists room_message_room_idx on room_message(room_id, id);
    """

    def __init__(self, base_url: str, api_key: str, *, table: str = "room_message", client: httpx.AsyncClient | None = None):
        self._base = base_url.rstrip("/")
        self._key = api_key
        self._client = client
        self._table = f"{self._base}/rest/v1/{table}"

    def _headers(self, extra: dict | None = None) -> dict:
        h = {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
        }
        if extra:
            h.update(extra)
        return h

    async def _request(self, method: str, url: str, **kw) -> httpx.Response:
        if self._client is not None:
            return await self._client.request(method, url, **kw)
        async with httpx.AsyncClient(timeout=10) as client:
            return await client.request(method, url, **kw)

    async def append(self, room_id: str, message: dict) -> None:
        resp = await self._request(
            "POST",
            self._table,
            headers=self._headers({"Prefer": "return=minimal"}),
            json={"room_id": room_id, "data": message},
        )
        if resp.status_code >= 400:
            raise SupabaseError(f"메시지 저장 실패({resp.status_code}): {resp.text[:200]}")

    async def recent(self, room_id: str, limit: int = 100) -> list[dict]:
        resp = await self._request(
            "GET",
            self._table,
            params={"room_id": f"eq.{room_id}", "select": "data", "order": "id.desc", "limit": str(limit)},
            headers=self._headers(),
        )
        if resp.status_code >= 400:
            raise SupabaseError(f"메시지 조회 실패({resp.status_code}): {resp.text[:200]}")
        rows = resp.json()
        return [r["data"] for r in reversed(rows)]
