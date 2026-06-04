from tour_agent.kakao import Place, RouteInfo
from tour_agent.tools import build_input_tools, order_route_toolspec


class FakeKakao:
    async def keyword_search(self, query, *, x=None, y=None, size=15):
        return [Place("1", "흑돼지집", "음식점 > 한식", "064-1", "성산", 126.9, 33.4, "u", 120)]

    async def directions(self, origin, destination, *, waypoints=None):
        return RouteInfo(distance_m=12000, duration_s=1500)


async def test_order_route_tool_orders_by_route():
    t = order_route_toolspec()
    out = await t.handler(
        {
            "accommodation": {"x": 0.0, "y": 0.0},
            "stops": [
                {"name": "C", "x": 0.03, "y": 0.0},
                {"name": "A", "x": 0.01, "y": 0.0},
                {"name": "B", "x": 0.02, "y": 0.0},
            ],
        }
    )
    assert out == "A -> B -> C"


async def test_order_route_tool_handles_empty():
    out = await order_route_toolspec().handler({"accommodation": {"x": 0.0, "y": 0.0}, "stops": []})
    assert "없습니다" in out


def test_input_tools_names():
    names = {t.name for t in build_input_tools(FakeKakao())}
    assert names == {"search_places", "travel_time", "order_route"}


async def test_search_and_travel_tools_via_fake_client():
    tools = {t.name: t for t in build_input_tools(FakeKakao())}
    s = await tools["search_places"].handler({"query": "흑돼지"})
    assert "흑돼지집" in s
    tv = await tools["travel_time"].handler(
        {"origin_x": 126.9, "origin_y": 33.4, "dest_x": 126.95, "dest_y": 33.45}
    )
    assert "12.0km" in tv and "25분" in tv
