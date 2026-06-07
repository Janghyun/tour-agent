"""Kakao Local(장소 검색) · Mobility(동선) 래퍼.

HTTP 전송은 주입한다(``http_get``) — 테스트는 페이크 JSON으로 결정적 검증하고,
프로덕션은 httpx 기반 전송을 꽂는다(실제 REST 키 필요).

※ Kakao Local 키워드 검색은 영업시간을 반환하지 않는다. 영업시간/휴무는
  에이전트가 WebSearch로 교차 확인하고 '확인 필요' 톤으로 답한다(설계 결정).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

import httpx

LOCAL_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
MOBILITY_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions"


class KakaoError(Exception):
    """Kakao API 호출 실패(길찾기 실패·빈 결과 등)."""


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    category: str
    phone: str
    address: str
    x: float
    y: float
    place_url: str
    distance_m: int | None = None
    source: str = ""  # 검색 출처(kakao/naver/google) — 종합 검색에서 표기


@dataclass(frozen=True)
class RouteInfo:
    distance_m: int
    duration_s: int


class HttpGet(Protocol):
    async def __call__(self, url: str, *, headers: dict, params: dict) -> dict: ...


def make_httpx_get(
    *, transport: httpx.AsyncBaseTransport | None = None, timeout: float = 10.0
) -> HttpGet:
    """httpx 기반 프로덕션 HTTP GET. 테스트는 ``transport=MockTransport(...)`` 주입."""

    async def http_get(url: str, *, headers: dict, params: dict) -> dict:
        async with httpx.AsyncClient(transport=transport, timeout=timeout) as client:
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()
            return response.json()

    return http_get


class KakaoClient:
    """Kakao Local · Mobility REST 래퍼."""

    def __init__(self, rest_key: str, *, http_get: HttpGet):
        self._key = rest_key
        self._http = http_get

    @classmethod
    def from_env(cls) -> "KakaoClient":
        """KAKAO_REST_API_KEY로 프로덕션 클라이언트를 만든다."""
        key = os.environ.get("KAKAO_REST_API_KEY")
        if not key:
            raise KakaoError("KAKAO_REST_API_KEY가 설정되지 않았습니다.")
        return cls(key, http_get=make_httpx_get())

    def _headers(self) -> dict:
        return {"Authorization": f"KakaoAK {self._key}"}

    async def keyword_search(
        self,
        query: str,
        *,
        x: float | None = None,
        y: float | None = None,
        radius: int | None = None,
        size: int = 15,
    ) -> list[Place]:
        params: dict = {"query": query, "size": size}
        if x is not None and y is not None:  # 위치 바이어스(가까운 순 거리 포함)
            params["x"] = x
            params["y"] = y
            if radius is not None:
                params["radius"] = radius
        data = await self._http(
            LOCAL_KEYWORD_URL, headers=self._headers(), params=params
        )
        return [self._to_place(d) for d in data.get("documents", [])]

    async def directions(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        *,
        waypoints: list[tuple[float, float]] | None = None,
        priority: str = "RECOMMEND",
    ) -> RouteInfo:
        params: dict = {
            "origin": self._coord(origin),
            "destination": self._coord(destination),
            "priority": priority,
        }
        if waypoints:
            params["waypoints"] = "|".join(self._coord(w) for w in waypoints)
        data = await self._http(
            MOBILITY_DIRECTIONS_URL, headers=self._headers(), params=params
        )
        routes = data.get("routes") or []
        if not routes:
            raise KakaoError("길찾기 결과가 없습니다")
        route = routes[0]
        if route.get("result_code") != 0:
            raise KakaoError(
                route.get("result_msg", f"길찾기 실패(code={route.get('result_code')})")
            )
        summary = route["summary"]
        return RouteInfo(
            distance_m=int(summary["distance"]),
            duration_s=int(summary["duration"]),
        )

    @staticmethod
    def _coord(point: tuple[float, float]) -> str:
        x, y = point
        return f"{x},{y}"

    @staticmethod
    def _to_place(d: dict) -> Place:
        dist = d.get("distance")
        return Place(
            id=d["id"],
            name=d["place_name"],
            category=d.get("category_name", ""),
            phone=d.get("phone", ""),
            address=d.get("road_address_name") or d.get("address_name", ""),
            x=float(d["x"]),
            y=float(d["y"]),
            place_url=d.get("place_url", ""),
            distance_m=int(dist) if dist not in (None, "") else None,
            source="kakao",
        )
