"""구글 Places(Text Search) 어댑터 — Kakao와 같은 keyword_search(query)->[Place] 인터페이스.

종합 검색의 한 소스. GOOGLE_PLACES_API_KEY가 있을 때만 활성. 구글은 평점(rating)을 주므로
category에 별점을 덧붙여 봇·사용자가 참고하게 한다(좌표·주소도 채움).
"""

from __future__ import annotations

import os

import httpx

from .kakao import Place

_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"


class GooglePlacesError(RuntimeError):
    pass


class GooglePlacesClient:
    def __init__(self, api_key: str, *, client: httpx.AsyncClient | None = None):
        self._key = api_key
        self._client = client

    async def _get(self, params: dict) -> httpx.Response:
        if self._client is not None:
            return await self._client.get(_URL, params=params)
        async with httpx.AsyncClient(timeout=10) as c:
            return await c.get(_URL, params=params)

    async def keyword_search(self, query: str, *, x=None, y=None, size: int = 6) -> list[Place]:
        params = {"query": query, "key": self._key, "language": "ko"}
        resp = await self._get(params)
        if resp.status_code >= 400:
            return []
        results = resp.json().get("results", [])[:size]
        out: list[Place] = []
        for r in results:
            loc = (r.get("geometry") or {}).get("location") or {}
            rating = r.get("rating")
            cat = r.get("types", [""])[0] if r.get("types") else ""
            if rating:
                cat = f"{cat} ★{rating}".strip()
            pid = r.get("place_id", "")
            out.append(Place(
                id=pid,
                name=r.get("name", ""),
                category=cat,
                phone="",
                address=r.get("formatted_address", ""),
                x=float(loc.get("lng", 0.0)),
                y=float(loc.get("lat", 0.0)),
                place_url=(f"https://www.google.com/maps/place/?q=place_id:{pid}" if pid else ""),
            ))
        return [p for p in out if p.name]

    @classmethod
    def from_env(cls) -> "GooglePlacesClient":
        key = os.environ.get("GOOGLE_PLACES_API_KEY")
        if not key:
            raise GooglePlacesError("GOOGLE_PLACES_API_KEY가 설정되지 않았습니다.")
        return cls(key)
