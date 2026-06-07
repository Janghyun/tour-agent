"""네이버 지역검색 어댑터 — Kakao와 같은 keyword_search(query)->[Place] 인터페이스.

종합 검색(search_aggregate)의 한 소스로 쓴다. NAVER_CLIENT_ID/SECRET 키가 있을 때만 활성.
httpx만 사용(MockTransport로 단위 검증). mapx/mapy는 경위도*1e7 정수.
"""

from __future__ import annotations

import os
import re

import httpx

from .kakao import Place

_URL = "https://openapi.naver.com/v1/search/local.json"
_TAG = re.compile(r"</?b>")


class NaverError(RuntimeError):
    pass


class NaverClient:
    def __init__(self, client_id: str, secret: str, *, client: httpx.AsyncClient | None = None):
        self._id = client_id
        self._secret = secret
        self._client = client

    async def _get(self, params: dict) -> httpx.Response:
        headers = {"X-Naver-Client-Id": self._id, "X-Naver-Client-Secret": self._secret}
        if self._client is not None:
            return await self._client.get(_URL, params=params, headers=headers)
        async with httpx.AsyncClient(timeout=10) as c:
            return await c.get(_URL, params=params, headers=headers)

    async def keyword_search(self, query: str, *, x=None, y=None, size: int = 6) -> list[Place]:
        resp = await self._get({"query": query, "display": min(size, 5)})
        if resp.status_code >= 400:
            return []
        items = resp.json().get("items", [])
        out: list[Place] = []
        for it in items:
            name = _TAG.sub("", it.get("title", "")).strip()
            if not name:
                continue
            try:
                px = int(it.get("mapx", "0")) / 1e7
                py = int(it.get("mapy", "0")) / 1e7
            except (TypeError, ValueError):
                px = py = 0.0
            out.append(Place(
                id="",
                name=name,
                category=it.get("category", ""),
                phone=it.get("telephone", ""),
                address=it.get("roadAddress") or it.get("address", ""),
                x=px,
                y=py,
                place_url=it.get("link", ""),
                source="naver",
            ))
        return out

    @classmethod
    def from_env(cls) -> "NaverClient":
        cid = os.environ.get("NAVER_CLIENT_ID")
        secret = os.environ.get("NAVER_CLIENT_SECRET")
        if not cid or not secret:
            raise NaverError("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET가 설정되지 않았습니다.")
        return cls(cid, secret)
