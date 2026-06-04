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

from .actions import ActionError, apply_action
from .groupchat import AgentRunner, Message, Room
from .state import itinerary_card_to_places, state_view

CardSink = Callable[[dict], Awaitable[None]]
AgentFactory = Callable[[str, CardSink], AgentRunner]  # (room_id, emit_card) -> AgentRunner


class RoomHub:
    """방 ↔ (Room, 연결된 WebSocket들)을 관리한다. 방마다 Room(=세션) 하나."""

    def __init__(
        self, agent_factory: AgentFactory, *, store=None, debounce_seconds: float = 1.5
    ):
        self._agent_factory = agent_factory
        self._store = store
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
                # 일정 카드는 작업 일정으로 영속화 — 방장 확정이 실제 일정을 스냅샷하도록.
                if self._store is not None and card.get("type") == "itinerary":
                    st = await self._store.load(room_id)
                    st.set_working_itinerary(itinerary_card_to_places(card))
                    await self._store.save(st)
                    await self.broadcast_json(
                        room_id,
                        {"speaker": "시스템", "type": "state", "state": state_view(st)},
                    )
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

    async def broadcast_json(self, room_id: str, message: dict) -> None:
        targets = list(self._conns.get(room_id, set()))
        if targets:
            await asyncio.gather(
                *(ws.send_json(message) for ws in targets), return_exceptions=True
            )


def create_app(
    agent_factory: AgentFactory, *, store=None, debounce_seconds: float = 1.5
) -> FastAPI:
    app = FastAPI()
    hub = RoomHub(agent_factory, store=store, debounce_seconds=debounce_seconds)
    app.state.hub = hub

    @app.websocket("/ws/{room_id}")
    async def ws_endpoint(ws: WebSocket, room_id: str) -> None:
        await ws.accept()
        hub.add(room_id, ws)
        room = hub.room(room_id)

        async def emit_state(view: dict) -> None:
            await hub.broadcast_json(
                room_id, {"speaker": "시스템", "type": "state", "state": view}
            )

        try:
            while True:
                data = await ws.receive_json()
                if isinstance(data, dict) and data.get("action"):
                    # 상태 변경 액션(후보 추가·확정·선호 등)
                    if store is None:
                        await ws.send_json(
                            {"speaker": "시스템", "type": "error", "text": "상태 저장이 비활성화됨"}
                        )
                        continue
                    try:
                        await apply_action(store, room_id, data, emit_state=emit_state)
                    except (ActionError, KeyError) as exc:
                        await ws.send_json(
                            {"speaker": "시스템", "type": "error", "text": str(exc)}
                        )
                else:
                    # 채팅 메시지
                    await room.post(
                        Message(
                            speaker=data.get("speaker", "익명"),
                            text=data.get("text", ""),
                        )
                    )
        except WebSocketDisconnect:
            hub.remove(room_id, ws)

    return app
