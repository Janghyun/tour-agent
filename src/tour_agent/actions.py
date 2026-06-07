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


async def add_candidate_by_link(
    store: StateStore, room_id: str, url: str, *, url_resolver, place_finder, emit_state: EmitState
):
    """링크에서 장소명을 뽑아(``url_resolver``) 검색·등록한다. 이름을 못 얻으면 None."""
    name = await url_resolver(url)
    if not name:
        return None
    return await add_candidate_by_query(
        store, room_id, name, place_finder=place_finder, emit_state=emit_state
    )


async def _with_coords(place: Place, place_finder) -> Place:
    """좌표가 없으면(x/y가 0/없음) 이름으로 검색해 좌표·링크가 채워진 Place로 바꾼다.

    프론트의 '추가' 버튼은 AI 추천처럼 좌표 없는 옵션을 x=0,y=0으로 보낼 수 있는데,
    그러면 지도에 핀을 못 찍는다(MapView는 x·y가 있어야 표시). 검색으로 실좌표를 채운다.
    이미 좌표가 있으면 그대로 둔다(불필요한 검색·덮어쓰기 방지).
    """
    if place_finder is None or (place.x and place.y) or not place.name:
        return place
    try:
        results = await place_finder(place.name)
    except Exception:  # noqa: BLE001 - 검색 실패는 무시(좌표 없는 채로 둔다)
        results = None
    if results and results[0].x and results[0].y:
        hit = results[0]
        # id·name은 보존(담음 배지·선호가 id로 묶여 있다). 좌표·링크 등 빈 값만 채운다.
        from dataclasses import replace

        return replace(
            place,
            x=hit.x,
            y=hit.y,
            place_url=place.place_url or hit.place_url,
            category=place.category or hit.category,
            address=place.address or hit.address,
            source=place.source or hit.source,
        )
    return place


async def heal_coords(state, place_finder) -> bool:
    """state의 좌표 없는 후보·숙소를 검색해 좌표를 채운다(지도 표시용). 바뀌면 True.

    예전에 좌표 없이(x=0,y=0) 저장된 후보를 입장 시 한 번 교정하는 자가치유.
    id·name을 보존하므로 담음 배지·선호가 깨지지 않고, 좌표가 채워지면 영속에 반영해
    다음 입장부턴 재검색하지 않는다.
    """
    if place_finder is None:
        return False
    changed = False
    cands = []
    for p in state.candidates:
        np = await _with_coords(p, place_finder)
        changed = changed or (np is not p)
        cands.append(np)
    accs = []
    for a in state.accommodations:
        na = await _with_coords(a, place_finder)
        changed = changed or (na is not a)
        accs.append(na)
    if changed:
        state.candidates = cands
        state.accommodations = accs
    return changed


async def apply_action(
    store: StateStore, room_id: str, action: dict, *, emit_state: EmitState, place_finder=None
) -> None:
    state = await store.load(room_id)
    kind = action.get("action")

    if kind == "set_meta":
        for key in ("destination", "dates", "owner"):
            if key in action:
                setattr(state, key, action[key])
    elif kind == "add_candidate":
        state.add_candidate(await _with_coords(_place_from(action["place"]), place_finder))
    elif kind == "remove_candidate":
        state.remove_candidate(str(action["place_id"]))
    elif kind == "set_accommodation":
        state.accommodations = [await _with_coords(_place_from(action["place"]), place_finder)]  # 단일(박별은 추후)
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
