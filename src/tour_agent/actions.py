"""클라이언트 액션 → 방 상태(RoomState) 쓰기.

채팅 메시지(``{"speaker","text"}``)와 달리, 상태를 바꾸는 동작은 액션 메시지로 온다:
``{"action": "...", ...}``. 적용 후 변경된 상태 뷰를 브로드캐스트한다(진실의 원천=Supabase 앱 상태).
"""

from __future__ import annotations

from typing import Awaitable, Callable

from .kakao import Place
from .state import StateStore, state_view


class ActionError(Exception):
    """잘못된/권한 없는 액션."""


EmitState = Callable[[dict], Awaitable[None]]


def _place_from(d: dict) -> Place:
    return Place(
        id=str(d.get("id", "")),
        name=d.get("name", ""),
        category=d.get("category", ""),
        phone=d.get("phone", ""),
        address=d.get("address", ""),
        x=float(d.get("x", 0.0)),
        y=float(d.get("y", 0.0)),
        place_url=d.get("place_url", ""),
        distance_m=d.get("distance_m"),
    )


async def add_candidate_by_query(
    store: StateStore, room_id: str, query: str, *, place_finder, emit_state: EmitState
):
    """장소명(또는 링크에서 얻은 이름)을 검색해 첫 결과를 후보로 등록한다(좌표 포함).

    ``place_finder(query) -> list[Place]`` 를 주입한다(프로덕션=Kakao 키워드 검색).
    결과가 없으면 None을 반환하고 아무것도 바꾸지 않는다.
    """
    results = await place_finder(query)
    if not results:
        return None
    place = results[0]
    state = await store.load(room_id)
    state.add_candidate(place)
    await store.save(state)
    await emit_state(state_view(state))
    return place


async def apply_action(
    store: StateStore, room_id: str, action: dict, *, emit_state: EmitState
) -> None:
    state = await store.load(room_id)
    kind = action.get("action")

    if kind == "set_meta":
        for key in ("destination", "dates", "owner"):
            if key in action:
                setattr(state, key, action[key])
    elif kind == "add_candidate":
        state.add_candidate(_place_from(action["place"]))
    elif kind == "remove_candidate":
        state.remove_candidate(str(action["place_id"]))
    elif kind == "set_accommodation":
        state.accommodations = [_place_from(action["place"])]  # 단일(박별은 추후)
    elif kind == "set_preference":
        state.set_preference(
            action["traveler"], action["target"], action["sentiment"]
        )
    elif kind == "confirm_itinerary":
        if action.get("by") != state.owner:
            raise ActionError("일정 확정은 방장만 할 수 있습니다.")
        state.confirm()
    else:
        raise ActionError(f"알 수 없는 액션: {kind!r}")

    await store.save(state)
    await emit_state(state_view(state))
