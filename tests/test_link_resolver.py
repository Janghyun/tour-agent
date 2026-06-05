"""링크 → 장소명 추출(resolve_place_name) — MockTransport로 HTML 파싱 검증(네트워크 없음)."""

import httpx

from tour_agent.link_resolver import resolve_place_name


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_resolve_from_og_title():
    def handler(req):
        return httpx.Response(200, text='<html><meta property="og:title" content="성산일출봉 : 카카오맵"></html>')

    name = await resolve_place_name("https://place.map.kakao.com/123", client=_client(handler))
    assert name == "성산일출봉"


async def test_resolve_falls_back_to_title_tag():
    def handler(req):
        return httpx.Response(200, text="<html><head><title>돈사돈 - 네이버 지도</title></head></html>")

    name = await resolve_place_name("https://naver.me/abc", client=_client(handler))
    assert name == "돈사돈"


async def test_resolve_none_when_no_title():
    def handler(req):
        return httpx.Response(200, text="<html><body>장소 정보 없음</body></html>")

    assert await resolve_place_name("https://x.com/p", client=_client(handler)) is None


async def test_resolve_none_on_http_error():
    def handler(req):
        return httpx.Response(404, text="not found")

    assert await resolve_place_name("https://x.com/p", client=_client(handler)) is None
