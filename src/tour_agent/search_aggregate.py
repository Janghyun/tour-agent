"""여러 검색 소스(Kakao·네이버·구글)를 종합해 한 장소 목록으로 합친다.

각 소스는 keyword_search(query)->[Place] 인터페이스를 따른다. 키가 있는 소스만 넘긴다.
이름(공백·대소문자 무시)으로 중복을 제거하고, 소스 순서를 우선한다(첫 소스가 대표).
"""

from __future__ import annotations

import asyncio
import re

_WS = re.compile(r"\s+")


def _norm(name: str) -> str:
    return _WS.sub("", (name or "")).lower()


async def _safe(source, query, x, y, size):
    try:
        return await source.keyword_search(query, x=x, y=y, size=size)
    except Exception:  # noqa: BLE001 - 한 소스 실패가 전체를 막지 않게
        return []


async def aggregate_search(query: str, sources, *, x=None, y=None, size: int = 6):
    if not sources:
        return []
    results = await asyncio.gather(*(_safe(s, query, x, y, size) for s in sources))
    merged = []
    seen = set()
    for lst in results:
        for p in lst:
            key = _norm(p.name)
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(p)
    return merged


def make_place_finder(sources):
    """종합 검색을 place_finder(query)->[Place] 형태로 묶는다."""

    async def finder(query, *, x=None, y=None, size: int = 6):
        return await aggregate_search(query, sources, x=x, y=y, size=size)

    return finder
