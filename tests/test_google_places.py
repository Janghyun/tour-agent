"""구글 Places 어댑터 — MockTransport로 파싱 검증."""

import httpx

from tour_agent.google_places import GooglePlacesClient


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_keyword_search_parses():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = str(req.url)
        return httpx.Response(200, json={"results": [
            {
                "name": "성산일출봉", "formatted_address": "제주 서귀포시 성산",
                "geometry": {"location": {"lat": 33.46, "lng": 126.94}},
                "rating": 4.5, "place_id": "abc", "types": ["tourist_attraction"],
            }
        ]})

    c = GooglePlacesClient("KEY", client=_client(handler))
    out = await c.keyword_search("성산일출봉")

    assert "maps.googleapis.com" in seen["url"] and "key=KEY" in seen["url"]
    assert out[0].name == "성산일출봉"
    assert abs(out[0].x - 126.94) < 1e-4 and abs(out[0].y - 33.46) < 1e-4
    assert "abc" in out[0].place_url  # place_id로 지도 링크


async def test_keyword_search_empty():
    def handler(req):
        return httpx.Response(200, json={"results": []})

    c = GooglePlacesClient("KEY", client=_client(handler))
    assert await c.keyword_search("없는곳") == []
