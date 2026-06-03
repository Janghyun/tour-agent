"""Kakao 기능을 에이전트 in-process 툴로 노출.

툴 '로직'(``search_places_tool``, ``travel_time_tool``)은 SDK와 분리해 결정적으로
테스트한다. SDK 등록(``build_kakao_tools``)은 claude_agent_sdk를 지연 임포트하는 seam이다.

보안(원칙): 검색·동선만 노출한다. bash·파일편집 등 위험 툴은 절대 노출하지 않는다(화이트리스트).
영업시간/휴무는 Kakao가 주지 않으므로 에이전트가 WebSearch로 교차 확인하고
'확인 필요' 톤으로 답한다.
"""

from __future__ import annotations

from .kakao import KakaoClient


async def search_places_tool(
    client: KakaoClient,
    query: str,
    *,
    x: float | None = None,
    y: float | None = None,
    size: int = 5,
) -> str:
    """키워드로 장소를 검색해 에이전트가 읽을 요약을 만든다."""
    places = await client.keyword_search(query, x=x, y=y, size=size)
    if not places:
        return f"'{query}' 검색 결과가 없습니다."
    lines = []
    for p in places:
        line = f"- {p.name} ({p.category}) / {p.address} / 좌표 {p.x},{p.y}"
        if p.distance_m is not None:
            line += f" / {p.distance_m}m"
        if p.phone:
            line += f" / {p.phone}"
        lines.append(line)
    lines.append("(영업시간·휴무는 WebSearch로 확인 후 '확인 필요' 톤으로 안내할 것)")
    return "\n".join(lines)


async def travel_time_tool(
    client: KakaoClient,
    origin: tuple[float, float],
    destination: tuple[float, float],
    *,
    waypoints: list[tuple[float, float]] | None = None,
) -> str:
    """두 지점(선택: 경유지) 간 자동차 거리·소요시간 요약."""
    route = await client.directions(origin, destination, waypoints=waypoints)
    km = route.distance_m / 1000
    minutes = round(route.duration_s / 60)
    return f"거리 약 {km:.1f}km, 소요 약 {minutes}분(자동차 기준)."


def build_kakao_tools(client: KakaoClient):
    """Kakao 툴을 SDK in-process MCP 서버로 등록한다(지연 임포트 seam).

    반환: (mcp_server_config, allowed_tool_names)
    ※ claude_agent_sdk 설치 환경에서 런타임 검증이 필요한 seam이다.
    """
    from claude_agent_sdk import create_sdk_mcp_server, tool

    @tool("search_places", "키워드로 장소(명소·식당 등)를 검색한다", {"query": str})
    async def _search(args: dict) -> dict:
        text = await search_places_tool(
            client, args["query"], x=args.get("x"), y=args.get("y")
        )
        return {"content": [{"type": "text", "text": text}]}

    @tool(
        "travel_time",
        "두 지점 간 자동차 거리·소요시간을 구한다",
        {"origin_x": float, "origin_y": float, "dest_x": float, "dest_y": float},
    )
    async def _travel(args: dict) -> dict:
        text = await travel_time_tool(
            client,
            (args["origin_x"], args["origin_y"]),
            (args["dest_x"], args["dest_y"]),
        )
        return {"content": [{"type": "text", "text": text}]}

    server = create_sdk_mcp_server("kakao", "1.0.0", tools=[_search, _travel])
    return server, ["mcp__kakao__search_places", "mcp__kakao__travel_time"]
