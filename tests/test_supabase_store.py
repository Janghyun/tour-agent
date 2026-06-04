from tour_agent.kakao import Place
from tour_agent.state import RoomState, SupabaseStateStore


def _p(name, x=0.0, y=0.0):
    return Place(name, name, "음식점", "", "", x, y, "", None)


def test_roomstate_dict_roundtrip():
    s = RoomState(room_id="r", destination="제주", dates="6/10~13", owner="민수")
    s.add_candidate(_p("흑돼지집", 126.9, 33.4))
    s.set_working_itinerary([_p("성산", 126.93, 33.45)])
    s.confirm()
    s.add_preference("민수", "카페", "like")

    s2 = RoomState.from_dict(s.to_dict())

    assert s2.destination == "제주" and s2.owner == "민수"
    assert [p.name for p in s2.candidates] == ["흑돼지집"]
    assert [p.name for p in s2.confirmed_itinerary] == ["성산"]
    assert s2.preferences[0].target == "카페"
    assert s2.candidates[0].x == 126.9


class FakeRows:
    def __init__(self):
        self.d = {}

    async def get(self, room_id):
        return self.d.get(room_id)

    async def upsert(self, room_id, data):
        self.d[room_id] = data


async def test_supabase_store_save_load_roundtrip():
    store = SupabaseStateStore(FakeRows())
    s = await store.load("r")
    s.destination = "제주"
    s.add_candidate(_p("우도", 126.95, 33.5))
    await store.save(s)

    s2 = await store.load("r")
    assert s2.destination == "제주"
    assert [p.name for p in s2.candidates] == ["우도"]


async def test_supabase_store_unknown_room_is_fresh():
    store = SupabaseStateStore(FakeRows())
    fresh = await store.load("none")
    assert fresh.room_id == "none" and fresh.candidates == []
