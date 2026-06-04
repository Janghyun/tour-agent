"""FastAPI WebSocket 진입점 — 방별 그룹챗 코어 배선.

제약(반드시 지킬 것):
- 약관: 외부 출시 빌드는 반드시 ``BACKEND=api``. CLI(구독) 경로는 개인·사내 도구로만.
  (제3자 제품이 claude.ai 구독/로그인으로 인증하는 것은 금지된다.)
- 보안: Agent SDK 기본 포함 bash·파일편집 등 위험 툴은 노출 금지. allowed_tools 화이트리스트만.
- 세션 동시성: 방별 락 없이 동시 query 금지(SDK 세션 컨텍스트 손상). ``Room``이 직렬화를 보장한다.
"""

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .groupchat import AgentRunner, Message, Room

CardSink = Callable[[dict], Awaitable[None]]
AgentFactory = Callable[[str, CardSink], AgentRunner]  # (room_id, emit_card) -> AgentRunner


class RoomHub:
    """방 ↔ (Room, 연결된 WebSocket들)을 관리한다. 방마다 Room(=세션) 하나."""

    def __init__(self, agent_factory: AgentFactory, *, debounce_seconds: float = 1.5):
        self._agent_factory = agent_factory
        self._debounce = debounce_seconds
        self._rooms: dict[str, Room] = {}
        self._conns: dict[str, set[WebSocket]] = {}

    def room(self, room_id: str) -> Room:
        if room_id not in self._rooms:
            conns = self._conns.setdefault(room_id, set())

            async def _fanout(message: dict) -> None:
                # 방의 모든 클라이언트에게 동시 팬아웃(순차 전송 시 백프레셔로 서로 막힘).
                targets = list(conns)
                if targets:
                    await asyncio.gather(
                        *(ws.send_json(message) for ws in targets),
                        return_exceptions=True,
                    )

            async def broadcast(text: str) -> None:
                await _fanout({"speaker": "봇", "text": text})

            async def emit_card(card: dict) -> None:
                await _fanout({"speaker": "봇", "type": "card", "card": card})

            self._rooms[room_id] = Room(
                room_id,
                self._agent_factory(room_id, emit_card),
                broadcast,
                debounce_seconds=self._debounce,
            )
        return self._rooms[room_id]

    def add(self, room_id: str, ws: WebSocket) -> None:
        self._conns.setdefault(room_id, set()).add(ws)
        self.room(room_id)  # 방(세션) 보장

    def remove(self, room_id: str, ws: WebSocket) -> None:
        self._conns.get(room_id, set()).discard(ws)


def create_app(
    agent_factory: AgentFactory, *, debounce_seconds: float = 1.5
) -> FastAPI:
    app = FastAPI()
    hub = RoomHub(agent_factory, debounce_seconds=debounce_seconds)
    app.state.hub = hub

    @app.websocket("/ws/{room_id}")
    async def ws_endpoint(ws: WebSocket, room_id: str) -> None:
        await ws.accept()
        hub.add(room_id, ws)
        room = hub.room(room_id)
        try:
            while True:
                data = await ws.receive_json()
                await room.post(
                    Message(
                        speaker=data.get("speaker", "익명"),
                        text=data.get("text", ""),
                    )
                )
        except WebSocketDisconnect:
            hub.remove(room_id, ws)

    return app
