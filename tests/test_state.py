from tour_agent.kakao import Place
from tour_agent.state import (
    InMemoryStateStore,
    Preference,
    RoomState,
    room_snapshot,
)


def P(name: str) -> Place:
    return Place(name, name, "", "", "", 0.0, 0.0, "")


def test_add_candidate_dedupes_by_id():
    s = RoomState(room_id="r")
    s.add_candidate(P("A"))
    s.add_candidate(P("A"))
    s.add_candidate(P("B"))
    assert [p.name for p in s.candidates] == ["A", "B"]


def test_remove_candidate():
    s = RoomState(room_id="r")
    s.add_candidate(P("A"))
    s.add_candidate(P("B"))
    s.remove_candidate("A")
    assert [p.name for p in s.candidates] == ["B"]


def test_confirm_snapshots_working_itinerary():
    s = RoomState(room_id="r")
    s.set_working_itinerary([P("A"), P("B")])
    s.confirm()
    # 확정 후 작업본을 바꿔도 확정 일정은 고정된다.
    s.working_itinerary.append(P("C"))
    assert [p.name for p in s.confirmed_itinerary] == ["A", "B"]


def test_add_preference_accumulates_per_traveler():
    s = RoomState(room_id="r")
    s.add_preference("민수", "카페", "like")
    s.add_preference("영희", "회", "dislike")
    assert Preference("민수", "카페", "like") in s.preferences
    assert Preference("영희", "회", "dislike") in s.preferences


async def test_inmemory_store_persists_across_load():
    store = InMemoryStateStore()
    s = await store.load("r")
    s.destination = "제주"
    s.add_candidate(P("성산"))
    await store.save(s)

    s2 = await store.load("r")
    assert s2.destination == "제주"
    assert [p.name for p in s2.candidates] == ["성산"]


def test_room_snapshot_summarizes_core_state():
    s = RoomState(room_id="r", destination="제주", dates="6/10~13")
    s.accommodations = [P("애월펜션")]
    s.set_working_itinerary([P("성산"), P("우도")])
    s.confirm()

    snap = room_snapshot(s)
    assert "제주" in snap
    assert "6/10~13" in snap
    assert "애월펜션" in snap
    assert "성산" in snap and "우도" in snap
