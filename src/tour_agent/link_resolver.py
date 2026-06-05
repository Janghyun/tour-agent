"""링크 → 장소명 추출. 채팅에 붙인 링크를 후보로 등록할 때, URL의 페이지 제목에서
장소명을 뽑아 Kakao 검색에 넘긴다(좌표는 검색이 채운다).

og:title 우선, 없으면 <title>. "성산일출봉 : 카카오맵" 같은 제목은 구분자 앞부분만 쓴다.
httpx만 사용(MockTransport로 단위 검증). 봇 차단으로 제목을 못 얻으면 None(상위에서 안내).
"""

from __future__ import annotations

import re

import httpx

_OG_A = re.compile(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', re.I)
_OG_B = re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']', re.I)
_TITLE = re.compile(r"<title[^>]*>([^<]+)</title>", re.I)
_SEP = re.compile(r"\s*[:\-|·]\s*")

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; tour-agent/1.0)",
    "Accept-Language": "ko-KR,ko;q=0.9",
}


async def resolve_place_name(url: str, *, client: httpx.AsyncClient | None = None) -> str | None:
    try:
        if client is not None:
            resp = await client.get(url, follow_redirects=True, headers=_HEADERS)
        else:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
                resp = await c.get(url, headers=_HEADERS)
    except httpx.HTTPError:
        return None
    if resp.status_code >= 400:
        return None
    html = resp.text or ""
    m = _OG_A.search(html) or _OG_B.search(html) or _TITLE.search(html)
    if not m:
        return None
    name = _SEP.split(m.group(1).strip())[0].strip()
    return name or None
