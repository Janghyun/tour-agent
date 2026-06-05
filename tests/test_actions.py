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
