import httpx
import pytest

from tour_agent.kakao import (
    MOBILITY_DIRECTIONS_URL,
    KakaoClient,
    KakaoError,
    Place,
    RouteInfo,
    make_httpx_get,
)


class FakeHttp:
    """주입용 페이크 HTTP GET — 정해진 JSON을 돌려주고 요청을 기록한다."""

    def __init__(self, response: dict):
        self.response = response
        self.calls: list[tuple] = []

    async def __call__(self, url: str, *, headers: dict, params: dict) -> dict:
        self.calls.append((url, headers, params))
        return self.response


async def test_keyword_search_parses_places_and_builds_request():
    resp = {
        "documents": [
            {
                "id": "1",
                "place_name": "성산 흑돼지",
                "category_name": "음식점 > 한식 > 육류,고기",
                "phone": "064-111-2222",
                "address_name": "제주 서귀포시 성산읍",
                "road_address_name": "제주 서귀포시 일주동로 1",
                "x": "126.93",
                "y": "33.45",
                "place_url": "http://place.map.kakao.com/1",
                "distance": "120",
            }
        ],
        "meta": {"total_count": 1},
    }
    http = FakeHttp(resp)
    client = KakaoClient("REST_KEY", http_get=http)

    places = await client.keyword_search("성산 흑돼지")

    assert places == [
        Place(
            id="1",
            name="성산 흑돼지",
            category="음식점 > 한식 > 육류,고기",
            phone="064-111-2222",
            address="제주 서귀포시 일주동로 1",
            x=126.93,
            y=33.45,
            place_url="http://place.map.kakao.com/1",
            distance_m=120,
        )
    ]

    url, headers, params = http.calls[0]
    assert url.endswith("/v2/local/search/keyword.json")
    assert headers["Authorization"] == "KakaoAK REST_KEY"
    assert params["query"] == "성산 흑돼지"


async def test_keyword_search_with_location_bias_sends_coords():
    http = FakeHttp({"documents": [], "meta": {"total_count": 0}})
    client = KakaoClient("KEY", http_get=http)

    await client.keyword_search("카페", x=126.9, y=33.4, radius=2000)

    _, _, params = http.calls[0]
    assert params["x"] == 126.9
    assert params["y"] == 33.4
    assert params["radius"] == 2000


async def test_directions_parses_distance_and_duration_and_builds_request():
    resp = {"routes": [{"result_code": 0, "summary": {"distance": 12000, "duration": 1500}}]}
    http = FakeHttp(resp)
    client = KakaoClient("KEY", http_get=http)

    route = await client.directions(
        (126.90, 33.40), (126.95, 33.45), waypoints=[(126.92, 33.42)]
    )

    assert route == RouteInfo(distance_m=12000, duration_s=1500)
    url, headers, params = http.calls[0]
    assert url == MOBILITY_DIRECTIONS_URL
    assert headers["Authorization"] == "KakaoAK KEY"
    assert params["origin"] == "126.9,33.4"
    assert params["destination"] == "126.95,33.45"
    assert params["waypoints"] == "126.92,33.42"


async def test_directions_raises_on_failed_route():
    resp = {"routes": [{"result_code": 104, "result_msg": "출발지와 도착지가 너무 가깝습니다"}]}
    client = KakaoClient("KEY", http_get=FakeHttp(resp))

    with pytest.raises(KakaoError):
        await client.directions((1.0, 2.0), (1.0, 2.0))


async def test_make_httpx_get_issues_get_and_returns_json():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"documents": [], "meta": {"total_count": 0}})

    http_get = make_httpx_get(transport=httpx.MockTransport(handler))
    data = await http_get(
        "https://dapi.kakao.com/v2/local/search/keyword.json",
        headers={"Authorization": "KakaoAK K"},
        params={"query": "카페"},
    )

    assert data == {"documents": [], "meta": {"total_count": 0}}
    assert "query=" in seen["url"]
    assert seen["auth"] == "KakaoAK K"


async def test_keyword_search_end_to_end_with_real_transport():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "documents": [
                    {
                        "id": "7",
                        "place_name": "우도 카페",
                        "category_name": "음식점 > 카페",
                        "phone": "",
                        "address_name": "제주",
                        "road_address_name": "제주 우도면",
                        "x": "126.95",
                        "y": "33.50",
                        "place_url": "http://place/7",
                    }
                ],
                "meta": {"total_count": 1},
            },
        )

    client = KakaoClient(
        "K", http_get=make_httpx_get(transport=httpx.MockTransport(handler))
    )
    places = await client.keyword_search("우도 카페", x=126.95, y=33.50)

    assert places[0].name == "우도 카페"
    assert places[0].x == 126.95
    assert places[0].distance_m is None  # 응답에 distance 없으면 None


def test_from_env_requires_key(monkeypatch):
    monkeypatch.delenv("KAKAO_REST_API_KEY", raising=False)
    with pytest.raises(KakaoError):
        KakaoClient.from_env()
