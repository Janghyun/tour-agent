"""채팅 메시지 영속 — 방의 대화(사람 메시지·봇 텍스트·봇 카드)를 저장하고 입장 시 불러온다.

방 상태(RoomState)와 달리 메시지는 append-only 흐름이라 별도 스토어로 둔다.
인메모리 구현은 결정적으로 검증하고, Supabase 구현은 seam(supabase_store).
"""

from __future__ import annotations

from typing import Protocol


class MessageStore(Protocol):
    async def append(self, room_id: str, message: dict) -> None: ...
    async def recent(self, room_id: str, limit: int = 100) -> list[dict]: ...


class InMemoryMessageStore:
    """프로세스 메모리 기반(테스트·로컬). 서버 재시작 시 사라진다 → 프로덕션은 Supabase."""

    def __init__(self):
        self._rooms: dict[str, list[dict]] = {}

    async def append(self, room_id: str, message: dict) -> None:
        self._rooms.setdefault(room_id, []).append(message)

    async def recent(self, room_id: str, limit: int = 100) -> list[dict]:
        return list(self._rooms.get(room_id, []))[-limit:]
