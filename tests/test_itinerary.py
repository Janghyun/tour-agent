from tour_agent.itinerary import build_itinerary, order_route_tool, order_stops
from tour_agent.kakao import Place


def P(name: str, x: float, y: float) -> Place:
    return Place(name, name, "", "", "", x, y, "")


def test_order_stops_orders_by_route_from_accommodation():
    stops = [P("C", 0.03, 0.0), P("A", 0.01, 0.0), P("B", 0.02, 0.0)]
    ordered = order_stops((0.0, 0.0), stops)
    assert [s.name for s in ordered] == ["A", "B", "C"]


def test_order_stops_empty():
    assert order_stops((0.0, 0.0), []) == []


def test_order_route_tool_formats_sequence():
    stops = [P("C", 0.03, 0.0), P("A", 0.01, 0.0), P("B", 0.02, 0.0)]
    assert order_route_tool((0.0, 0.0), stops) == "A -> B -> C"


async def test_build_itinerary_applies_deterministic_ordering_between_llm_steps():
    candidates = [
        P("C", 0.03, 0.0),
        P("A", 0.01, 0.0),
        P("B", 0.02, 0.0),
        P("FAR", 0.5, 0.0),
    ]

    async def design(cands):
        # LLM '일정 설계'가 후보 중 3곳을 고른다(순서는 신경쓰지 않음).
        return [c for c in cands if c.name in {"A", "B", "C"}]

    seen = {}

    async def verify(ordered):
        # '검증'은 이미 동선 정렬된 일정을 받는다.
        seen["ordered"] = [s.name for s in ordered]
        return ordered

    result = await build_itinerary(
        (0.0, 0.0), candidates, design=design, verify=verify
    )

    assert [s.name for s in result] == ["A", "B", "C"]
    assert seen["ordered"] == ["A", "B", "C"]
