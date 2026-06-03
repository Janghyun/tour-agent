"""일정 구성 — 서브에이전트 3종(일정 설계 / 동선 최적화 / 검증)의 결정적 뼈대.

핵심 설계 결정: '동선 최적화'는 LLM이 아니라 결정적 알고리즘(route.optimize_route)이
한다. 오케스트레이션은 LLM 단계(설계·검증)를 주입받아, 그 사이에 결정적 정렬을 끼운다.
"""

from __future__ import annotations

from typing import Awaitable, Callable

from .kakao import Place
from .route import Dist, haversine_m, optimize_route

Point = tuple[float, float]
DesignStep = Callable[[list[Place]], Awaitable[list[Place]]]
VerifyStep = Callable[[list[Place]], Awaitable[list[Place]]]


def order_stops(
    accommodation: Point, stops: list[Place], *, dist: Dist = haversine_m
) -> list[Place]:
    """숙소 기준으로 방문 순서를 결정적으로 정렬한다."""
    if not stops:
        return []
    coords = [(s.x, s.y) for s in stops]
    order = optimize_route(accommodation, coords, dist=dist)
    return [stops[i] for i in order]


def order_route_tool(
    accommodation: Point, stops: list[Place], *, dist: Dist = haversine_m
) -> str:
    """동선 최적화를 에이전트 툴로 노출 — 정렬된 방문 순서를 텍스트로."""
    ordered = order_stops(accommodation, stops, dist=dist)
    if not ordered:
        return "(정렬할 장소가 없습니다)"
    return " -> ".join(s.name for s in ordered)


async def build_itinerary(
    accommodation: Point,
    candidates: list[Place],
    *,
    design: DesignStep,
    verify: VerifyStep,
    dist: Dist = haversine_m,
) -> list[Place]:
    """설계(LLM) -> 동선 최적화(결정적) -> 검증(LLM) 파이프라인.

    design/verify는 주입한다(프로덕션은 서브에이전트, 테스트는 페이크).
    """
    selected = await design(candidates)
    ordered = order_stops(accommodation, selected, dist=dist)
    return await verify(ordered)
