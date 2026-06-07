import pytest

from tour_agent.actions import ActionError, apply_action
from tour_agent.state import InMemoryStateStore


async def _run(store, room_id, action):
    seen = []

    async def emit_state(view):
        seen.append(view)

    await apply_action(store, room_id, action, emit_state=emit_state)
    return seen[-1] if seen else None


async def test_add_and_remove_candidate():
    store = InMemoryStateStore()
    view = await _run(
        store, "r",
        {"action": "add_candidate", "place": {"id": "7", "name": "흑돼지집", "x": 126.9, "y": 33.4}},
    )
    assert [c["name"] for c in view["candidates"]] == ["흑돼지집"]

    view = await _run(store, "r", {"action": "remove_candidate", "place_id": "7"})
    assert view["candidates"] == []


async def test_add_candidate_resolves_missing_coords_via_finder():
    """좌표 없이(AI 추천 등) 담은 후보는 이름으로 검색해 좌표·링크를 채운다(지도 표시용)."""
    from tour_agent.kakao import Place

    store = InMemoryStateStore()
    seen = []

    async def finder(q):
        assert q == "한라산"
        return [Place("9", "한라산", "명소", "", "제주", 126.53, 33.36, "http://k/한라산", source="kakao")]

    async def emit_state(v):
        seen.append(v)

    await apply_action(
        store, "r",
        {"action": "add_candidate", "place": {"name": "한라산", "x": 0, "y": 0}},
        emit_state=emit_state, place_finder=finder,
    )
    c = (await store.load("r")).candidates[0]
    assert c.x == 126.53 and c.y == 33.36  # 좌표 보강
    assert c.place_url == "http://k/한라산"


async def test_add_candidate_keeps_provided_coords():
    """이미 좌표가 있으면 검색하지 않고 그대로 둔다."""
    from tour_agent.kakao import Place

    store = InMemoryStateStore()
    called = []

    async def finder(q):
        called.append(q)
        return [Place("9", q, "x", "", "", 1.0, 2.0, "u")]

    async def emit_state(v):
        pass

    await apply_action(
        store, "r",
        {"action": "add_candidate", "place": {"id": "7", "name": "흑돼지집", "x": 126.9, "y": 33.4}},
        emit_state=emit_state, place_finder=finder,
    )
    c = (await store.load("r")).candidates[0]
    assert c.x == 126.9 and c.y == 33.4
    assert called == []  # 좌표 있으니 검색 안 함


async def test_set_accommodation_resolves_missing_coords():
    """숙소도 좌표 없이 들어오면 검색해 채워 지도에 출발 핀이 뜨게 한다."""
    from tour_agent.kakao import Place

    store = InMemoryStateStore()

    async def finder(q):
        return [Place("8", "제주신라호텔", "숙소", "", "서귀포", 126.62, 33.24, "u", source="kakao")]

    async def emit_state(v):
        pass

    await apply_action(
        store, "r",
        {"action": "set_accommodation", "place": {"name": "제주신라호텔", "x": 0, "y": 0}},
        emit_state=emit_state, place_finder=finder,
    )
    a = (await store.load("r")).accommodations[0]
    assert a.x == 126.62 and a.y == 33.24


async def test_set_preference():
    store = InMemoryStateStore()
    view = await _run(
        store, "r",
        {"action": "set_preference", "traveler": "민수", "target": "카페", "sentiment": "like"},
    )
    assert {"traveler": "민수", "target": "카페", "sentiment": "like"} in view["preferences"]


async def test_confirm_requires_owner():
    store = InMemoryStateStore()
    await _run(store, "r", {"action": "set_meta", "owner": "민수", "destination": "제주"})
    # 작업 일정이 있어야 확정이 의미 있으니 하나 넣어두기 위해 후보를 일정처럼은 생략 — 빈 확정도 허용
    view = await _run(store, "r", {"action": "confirm_itinerary", "by": "민수"})
    assert view["confirmed"] is True

    with pytest.raises(ActionError):
        await _run(store, "r", {"action": "confirm_itinerary", "by": "영희"})


async def test_add_candidate_by_query_uses_finder():
    from tour_agent.actions import add_candidate_by_query
    from tour_agent.kakao import Place

    store = InMemoryStateStore()
    seen = []

    async def finder(q):
        assert q == "성산일출봉"
        return [Place("1", "성산일출봉", "명소", "", "", 126.94, 33.46, "")]

    async def emit_state(v):
        seen.append(v)

    place = await add_candidate_by_query(store, "r", "성산일출봉", place_finder=finder, emit_state=emit_state)

    assert place.name == "성산일출봉"
    state = await store.load("r")
    assert [c.name for c in state.candidates] == ["성산일출봉"]
    assert state.candidates[0].x == 126.94  # 좌표까지 등록
    assert seen[-1]["candidates"][0]["name"] == "성산일출봉"


async def test_add_candidate_by_query_no_result_returns_none():
    from tour_agent.actions import add_candidate_by_query

    store = InMemoryStateStore()

    async def finder(q):
        return []

    async def emit_state(v):
        pass

    place = await add_candidate_by_query(store, "r", "없는곳", place_finder=finder, emit_state=emit_state)
    assert place is None


async def test_unknown_action_raises():
    store = InMemoryStateStore()
    with pytest.raises(ActionError):
        await _run(store, "r", {"action": "nope"})


async def test_persists_across_load():
    store = InMemoryStateStore()
    await _run(store, "r", {"action": "set_meta", "destination": "제주", "dates": "6/10~13"})
    state = await store.load("r")
    assert state.destination == "제주" and state.dates == "6/10~13"
