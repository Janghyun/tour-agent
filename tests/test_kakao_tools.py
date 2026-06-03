from tour_agent.kakao import Place, RouteInfo
from tour_agent.kakao_tools import search_places_tool, travel_time_tool


class FakeKakao:
    def __init__(self, places=None, route=None):
        self._places = places or []
        self._route = route

    async def keyword_search(self, query, *, x=None, y=None, size=15):
        return self._places

    async def directions(self, origin, destination, *, waypoints=None):
        return self._route


async def test_search_places_tool_formats_results():
    places = [
        Place(
            id="1",
            name="흑돼지집",
            category="음식점 > 한식",
            phone="064-1",
            address="제주 성산읍",
            x=126.9,
            y=33.4,
            place_url="u",
            distance_m=120,
        )
    ]
    out = await search_places_tool(FakeKakao(places=places), "흑돼지")

    assert "흑돼지집" in out
    assert "126.9,33.4" in out
    assert "120m" in out
    assert "확인 필요" in out  # 영업시간은 WebSearch로 확인하라는 안내


async def test_search_places_tool_handles_empty():
    out = await search_places_tool(FakeKakao(places=[]), "없는장소")
    assert "검색 결과가 없습니다" in out


async def test_travel_time_tool_formats_distance_and_minutes():
    out = await travel_time_tool(
        FakeKakao(route=RouteInfo(distance_m=12000, duration_s=1500)),
        (126.9, 33.4),
        (126.95, 33.45),
    )
    assert "12.0km" in out
    assert "25분" in out  # 1500초 = 25분
