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


async def test_unknown_action_raises():
    store = InMemoryStateStore()
    with pytest.raises(ActionError):
        await _run(store, "r", {"action": "nope"})


async def test_persists_across_load():
    store = InMemoryStateStore()
    await _run(store, "r", {"action": "set_meta", "destination": "제주", "dates": "6/10~13"})
    state = await store.load("r")
    assert state.destination == "제주" and state.dates == "6/10~13"
