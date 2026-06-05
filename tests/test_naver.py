"""네이버 지역검색 어댑터 — MockTransport로 파싱 검증(네트워크 없음)."""

import httpx

from tour_agent.naver import NaverClient


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_keyword_search_parses_and_strips_bold():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        seen["id"] = req.headers.get("X-Naver-Client-Id")
        seen["secret"] = req.headers.get("X-Naver-Client-Secret")
        return httpx.Response(200, json={"items": [
            {
                "title": "<b>성산</b>일출봉", "category": "여행,관광>관광지",
                "telephone": "", "address": "제주 성산", "roadAddress": "제주 서귀포시 성산",
                "mapx": "1269417130", "mapy": "335000000", "link": "http://naver/1",
            }
        ]})

    c = NaverClient("ID", "SECRET", client=_client(handler))
    out = await c.keyword_search("성산일출봉")

    assert "openapi.naver.com" in seen["url"] and "search/local" in seen["url"]
    assert seen["id"] == "ID" and seen["secret"] == "SECRET"
    assert out[0].name == "성산일출봉"  # <b> 제거
    assert abs(out[0].x - 126.9417130) < 1e-4  # mapx/1e7
    assert abs(out[0].y - 33.5) < 1e-4  # mapy/1e7
    assert out[0].address == "제주 서귀포시 성산"  # 도로명 우선


async def test_keyword_search_empty():
    def handler(req):
        return httpx.Response(200, json={"items": []})

    c = NaverClient("ID", "SECRET", client=_client(handler))
    assert await c.keyword_search("없는곳") == []
