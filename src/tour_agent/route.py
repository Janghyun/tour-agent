"""결정적 동선 최적화 — 숙소(start)에서 출발해 모든 장소를 도는 방문 순서.

설계 결정: LLM은 방문 순서를 발명하지 않는다. 여기서 nearest-neighbor + 2-opt로
결정적으로 순서를 정하고, LLM은 그 위에 소프트 제약(영업시간·식사시간·선호)만 얹는다.

좌표는 (x=경도, y=위도). 기본 거리는 haversine(미터). 테스트는 평면 거리(euclid)를 주입한다.
경로는 열린 경로(start에서 출발, 마지막 장소에서 끝 — 숙소로의 복귀는 포함하지 않음).
"""

from __future__ import annotations

import math
from typing import Callable

Point = tuple[float, float]
Dist = Callable[[Point, Point], float]


def haversine_m(a: Point, b: Point) -> float:
    """(경도, 위도) 두 점 사이의 대권 거리(미터)."""
    lon1, lat1 = a
    lon2, lat2 = b
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def path_length(
    start: Point, coords: list[Point], order: list[int], *, dist: Dist = haversine_m
) -> float:
    total = 0.0
    prev = start
    for i in order:
        total += dist(prev, coords[i])
        prev = coords[i]
    return total


def nearest_neighbor_order(
    start: Point, coords: list[Point], *, dist: Dist = haversine_m
) -> list[int]:
    unvisited = set(range(len(coords)))
    order: list[int] = []
    cur = start
    while unvisited:
        nxt = min(unvisited, key=lambda i: dist(cur, coords[i]))
        order.append(nxt)
        unvisited.discard(nxt)
        cur = coords[nxt]
    return order


def two_opt(
    start: Point, coords: list[Point], order: list[int], *, dist: Dist = haversine_m
) -> list[int]:
    best = list(order)
    best_len = path_length(start, coords, best, dist=dist)
    improved = True
    while improved:
        improved = False
        n = len(best)
        for i in range(n - 1):
            for j in range(i + 1, n):
                cand = best[:i] + best[i : j + 1][::-1] + best[j + 1 :]
                cand_len = path_length(start, coords, cand, dist=dist)
                if cand_len + 1e-12 < best_len:
                    best, best_len = cand, cand_len
                    improved = True
    return best


def optimize_route(
    start: Point, coords: list[Point], *, dist: Dist = haversine_m
) -> list[int]:
    """숙소(start)에서 출발하는 방문 순서를 결정적으로 최적화한다."""
    if not coords:
        return []
    return two_opt(start, coords, nearest_neighbor_order(start, coords, dist=dist), dist=dist)
