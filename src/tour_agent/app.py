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

from .actions import ActionError, add_candidate_by_link, add_candidate_by_query, apply_action
from .groupchat import AgentRunner, Message, Room
from .state import itinerary_card_to_places, state_view

CardSink = Callable[[dict], Awaitable[None]]
AgentFactory = Callable[[str, CardSink], AgentRunner]  # (room_id, emit_card) -> AgentRunner


class RoomHub:
    """방 ↔ (Room, 연결된 WebSocket들)을 관리한다. 방마다 Room(=세션) 하나."""

    def __init__(
        self, agent_factory: AgentFactory, *, store=None, debounce_seconds: float = 1.5,
        message_store=None,
    ):
        self._agent_factory = agent_factory
        self._store = store
        self._debounce = debounce_seconds
        self._message_store = message_store
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
                await self.post_message(room_id, {"speaker": "봇", "text": text})

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
                await self.post_message(room_id, {"speaker": "봇", "type": "card", "card": card})

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

    async def post_message(self, room_id: str, message: dict) -> None:
        """대화 메시지(사람·봇·카드)를 방에 브로드캐스트하고 영속 저장한다(입장 시 복원용).
        상태(state)·에러 같은 일시 메시지는 이 메서드를 쓰지 않는다."""
        await self.broadcast_json(room_id, message)
        if self._message_store is not None:
            try:
                await self._message_store.append(room_id, message)
            except Exception:  # noqa: BLE001 - 저장 실패해도 실시간 대화는 유지
                pass

    async def history(self, room_id: str, limit: int = 100) -> list[dict]:
        if self._message_store is None:
            return []
        try:
            return await self._message_store.recent(room_id, limit)
        except Exception:  # noqa: BLE001
            return []


def create_app(
    agent_factory: AgentFactory, *, store=None, debounce_seconds: float = 1.5,
    place_finder=None, url_resolver=None, message_store=None, export_store=None,
) -> FastAPI:
    app = FastAPI()
    hub = RoomHub(
        agent_factory, store=store, debounce_seconds=debounce_seconds, message_store=message_store
    )
    app.state.hub = hub

    @app.websocket("/ws/{room_id}")
    async def ws_endpoint(ws: WebSocket, room_id: str) -> None:
        await ws.accept()
        # 입장 시 과거 대화를 이 클라이언트에게만 먼저 보내 화면을 복원한다(방 멤버 공유).
        for past in await hub.history(room_id):
            await ws.send_json({**past, "history": True})
        # 현재 방 상태(후보·선호·작업 일정)도 이 클라이언트에 보내 패널·지도 탭을 복원한다.
        # (상태는 액션이 일어날 때만 브로드캐스트되므로, 새로고침한 클라이언트엔 따로 줘야 한다.)
        if store is not None:
            try:
                st = await store.load(room_id)
                await ws.send_json({"speaker": "시스템", "type": "state", "state": state_view(st)})
            except Exception:  # noqa: BLE001 - 상태 복원 실패해도 입장은 막지 않는다
                pass
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
                    # 내보낸 일정 기록(방 멤버 공유) — 상태 저장(store)과 무관.
                    if data.get("action") == "add_export":
                        if export_store is not None:
                            try:
                                await export_store.append(room_id, {
                                    "title": data.get("title", ""), "dates": data.get("dates", ""),
                                    "html": data.get("html", ""), "ts": data.get("ts"),
                                })
                            except Exception:  # noqa: BLE001
                                pass
                        continue
                    if data.get("action") == "list_exports":
                        items = []
                        if export_store is not None:
                            try:
                                items = await export_store.recent(room_id, 30)
                            except Exception:  # noqa: BLE001
                                items = []
                        await ws.send_json({"type": "exports", "items": list(reversed(items))})
                        continue
                    # 상태 변경 액션(후보 추가·확정·선호 등)
                    if store is None:
                        await ws.send_json(
                            {"speaker": "시스템", "type": "error", "text": "상태 저장이 비활성화됨"}
                        )
                        continue
                    if data.get("action") == "add_place_by_link":
                        # 채팅 링크의 '후보 등록' 버튼 — 링크에서 장소명을 뽑아 검색·등록.
                        if place_finder is None or url_resolver is None:
                            await ws.send_json({"speaker": "시스템", "type": "error", "text": "링크 등록이 비활성이에요(검색 키 없음)."})
                            continue
                        try:
                            place = await add_candidate_by_link(
                                store, room_id, data.get("url", ""),
                                url_resolver=url_resolver, place_finder=place_finder, emit_state=emit_state,
                            )
                        except Exception:  # noqa: BLE001
                            place = None
                        if place is None:
                            await ws.send_json({"speaker": "시스템", "type": "error", "text": "링크에서 장소를 찾지 못했어요. ‘/후보 장소명’으로 등록해 보세요."})
                        else:
                            await hub.post_message(room_id, {"speaker": "봇", "text": f"‘{place.name}’을(를) 후보에 담았어요."})
                        continue
                    try:
                        await apply_action(store, room_id, data, emit_state=emit_state)
                    except (ActionError, KeyError) as exc:
                        await ws.send_json(
                            {"speaker": "시스템", "type": "error", "text": str(exc)}
                        )
                else:
                    # 채팅 메시지 — 방의 모두에게 공유(그룹챗)한 뒤 에이전트 처리.
                    speaker = data.get("speaker", "익명")
                    text = data.get("text", "")
                    await hub.post_message(room_id, {"speaker": speaker, "text": text})
                    # /후보 <장소명> — 봇(LLM) 안 거치고 즉시 Kakao 검색→후보 등록.
                    stripped = text.strip()
                    if stripped.startswith("/후보"):
                        query = stripped[len("/후보"):].strip()
                        if store is None or place_finder is None:
                            await hub.broadcast_json(room_id, {"speaker": "시스템", "type": "error", "text": "장소 검색이 비활성이에요(검색 키 없음)."})
                        elif not query:
                            await hub.post_message(room_id, {"speaker": "봇", "text": "등록할 장소명을 알려 주세요. 예) /후보 성산일출봉"})
                        else:
                            try:
                                place = await add_candidate_by_query(store, room_id, query, place_finder=place_finder, emit_state=emit_state)
                            except Exception:  # noqa: BLE001 - 검색 실패는 사용자에게 안내
                                place = None
                            txt = f"‘{place.name}’을(를) 후보에 담았어요." if place else f"‘{query}’ 검색 결과가 없어요. 다른 이름으로 시도해 보세요."
                            await hub.post_message(room_id, {"speaker": "봇", "text": txt})
                        continue
                    await room.post(Message(speaker=speaker, text=text))
        except WebSocketDisconnect:
            hub.remove(room_id, ws)

    return app
