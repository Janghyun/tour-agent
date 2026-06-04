"""작업 경로 입력 툴 — 에이전트가 호출하는 ToolSpec 묶음.

- search_places / travel_time : Kakao 래퍼(kakao_tools 로직) — KakaoClient 필요
- order_route : 결정적 동선 최적화(route.optimize_route) — 순수, 키 불필요

에이전트가 좌표를 인자로 넘기므로 order_route는 상태 결합이 없다(LLM이 순서를 짓지 않고
이 도구가 결정적으로 정한다).
"""

from __future__ import annotations

from .api_runner import ToolSpec
from .kakao import KakaoClient
from .kakao_tools import search_places_tool, travel_time_tool
from .route import optimize_route

SEARCH_SCHEMA = {
    "type": "object",
    "properties": {
        "query": {"type": "string"},
        "x": {"type": "number"},
        "y": {"type": "number"},
    },
    "required": ["query"],
}

TRAVEL_SCHEMA = {
    "type": "object",
    "properties": {
        "origin_x": {"type": "number"},
        "origin_y": {"type": "number"},
        "dest_x": {"type": "number"},
        "dest_y": {"type": "number"},
    },
    "required": ["origin_x", "origin_y", "dest_x", "dest_y"],
}

ORDER_SCHEMA = {
    "type": "object",
    "properties": {
        "accommodation": {
            "type": "object",
            "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
            "required": ["x", "y"],
        },
        "stops": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                },
                "required": ["name", "x", "y"],
            },
        },
    },
    "required": ["accommodation", "stops"],
}


def order_route_toolspec() -> ToolSpec:
    """숙소 기준 방문 순서를 동선 최적(NN+2-opt)으로 정하는 결정적 툴."""

    async def handler(args: dict) -> str:
        acc = (args["accommodation"]["x"], args["accommodation"]["y"])
        stops = args["stops"]
        if not stops:
            return "(정렬할 장소가 없습니다)"
        coords = [(s["x"], s["y"]) for s in stops]
        order = optimize_route(acc, coords)
        return " -> ".join(stops[i]["name"] for i in order)

    return ToolSpec(
        "order_route",
        "숙소 기준 방문 순서를 동선 최적으로 정한다(결정적 — 직접 순서를 지어내지 말 것)",
        ORDER_SCHEMA,
        handler,
    )


def build_input_tools(kakao_client: KakaoClient) -> list[ToolSpec]:
    """검색·동선·order_route 입력 툴 묶음."""

    async def search(args: dict) -> str:
        return await search_places_tool(
            kakao_client, args["query"], x=args.get("x"), y=args.get("y")
        )

    async def travel(args: dict) -> str:
        return await travel_time_tool(
            kakao_client,
            (args["origin_x"], args["origin_y"]),
            (args["dest_x"], args["dest_y"]),
        )

    return [
        ToolSpec("search_places", "키워드로 장소를 검색한다", SEARCH_SCHEMA, search),
        ToolSpec("travel_time", "두 지점 간 자동차 거리·소요시간을 구한다", TRAVEL_SCHEMA, travel),
        order_route_toolspec(),
    ]
