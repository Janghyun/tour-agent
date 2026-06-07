"""build_itinerary — 봇이 준 장소 목록(plan)을 좌표·동선·시간까지 코드로 조립."""

from tour_agent.itinerary_build import build_itinerary
from tour_agent.kakao import Place, RouteInfo

_DB = {
    "애월 숙소": Place("0", "애월 숙소", "숙소", "", "", 126.31, 33.46, "u0"),
    "성산일출봉": Place("1", "성산일출봉", "명소", "", "", 126.94, 33.46, "u1"),
    "우도": Place("2", "우도", "자연", "", "", 126.95, 33.50, "u2"),
    "돈사돈": Place("3", "돈사돈", "흑돼지", "", "", 126.49, 33.49, "u3"),
}


async def _finder(q, *, x=None, y=None, size=6):
    return [_DB[q]] if q in _DB else []


async def test_build_fills_coords_orders_and_times():
    plan = {
        "title": "제주",
        "days": [{
            "date": "7/26", "accommodation": "애월 숙소",
            "items": [{"name": "우도"}, {"name": "성산일출봉"}, {"name": "돈사돈", "meal": "dinner"}],
        }],
    }
    card = await build_itinerary(plan, place_finder=_finder)

    assert card["type"] == "itinerary"
    day = card["days"][0]
    assert all(i.get("x") and i.get("y") for i in day["items"])  # 좌표 채움
    assert [i["time"] for i in day["items"]] == sorted(i["time"] for i in day["items"])  # 시간 오름차순
    names = [i["name"] for i in day["items"]]
    assert {"우도", "성산일출봉", "돈사돈"} <= set(names)
    assert names[-1].endswith("체크인")  # 첫날 숙소 체크인은 동선 마지막


async def test_build_uses_route_finder_for_travel():
    async def route(origin, dest):
        return RouteInfo(distance_m=10000, duration_s=1200)  # 20분

    plan = {"days": [{"accommodation": "애월 숙소", "items": [{"name": "성산일출봉"}, {"name": "우도"}]}]}
    card = await build_itinerary(plan, place_finder=_finder, route_finder=route)
    travels = [i.get("travel_from_prev") for i in card["days"][0]["items"]]
    assert any(t and "20분" in t for t in travels)  # 실제 경로 시간 반영


async def test_build_passes_meal_alternatives():
    plan = {"days": [{
        "accommodation": "애월 숙소",
        "items": [
            {"name": "성산일출봉"},
            {"name": "돈사돈", "category": "흑돼지", "meal": "dinner", "alternatives": ["흑돈가", "숙성도"]},
        ],
    }]}
    card = await build_itinerary(plan, place_finder=_finder)
    by = {i["name"]: i for i in card["days"][0]["items"]}
    assert [a["name"] for a in by["돈사돈"]["alternatives"]] == ["흑돈가", "숙성도"]
    assert by["성산일출봉"].get("alternatives", []) == []  # 대안 없는 항목은 빈 목록


async def test_build_substitutes_found_alternative_when_primary_missing():
    """주 식당이 검색 0건(환각)이면, 검색되는 대안으로 대체해 정보 없는 항목을 줄인다."""
    plan = {"days": [{
        "accommodation": "애월 숙소",
        "items": [
            {"name": "성산일출봉"},
            {"name": "한그릇뚝딱 제주시", "category": "백반", "meal": "lunch",
             "alternatives": ["없는집", "돈사돈"]},
        ],
    }]}
    card = await build_itinerary(plan, place_finder=_finder)
    names = [i["name"] for i in card["days"][0]["items"]]
    assert "한그릇뚝딱 제주시" not in names  # 검색 0건 환각 이름은 빠짐
    by = {i["name"]: i for i in card["days"][0]["items"]}
    assert by["돈사돈"].get("x") and by["돈사돈"].get("y")  # 검색되는 대안으로 대체(좌표 포함)


async def test_build_meal_falls_back_to_category_search_near_region():
    """식사 칸이 이름·대안 모두 검색 0건이면 카테고리로 권역 검색해 실제 맛집으로 채운다."""
    async def finder(q, *, x=None, y=None, size=6):
        if q in _DB:
            return [_DB[q]]
        if q == "흑돼지" and x is not None:  # 카테고리 + 권역 bias 검색만 결과 있음
            return [Place("p", "성산 흑돼지맛집", "흑돼지", "", "", 126.93, 33.45, "uX", source="kakao")]
        return []

    plan = {"days": [{
        "accommodation": "애월 숙소",
        "items": [
            {"name": "성산일출봉"}, {"name": "우도"},
            {"name": "없는식당", "category": "흑돼지", "meal": "dinner", "alternatives": ["또없음"]},
        ],
    }]}
    card = await build_itinerary(plan, place_finder=finder)
    by = {i["name"]: i for i in card["days"][0]["items"]}
    assert "없는식당" not in by  # 환각 이름은 빠지고
    assert "성산 흑돼지맛집" in by and by["성산 흑돼지맛집"].get("x")  # 권역 실제 맛집으로 대체


async def test_build_non_meal_unlocated_not_category_replaced():
    """식사가 아닌 항목은 카테고리 대체를 하지 않는다(엉뚱한 곳으로 바뀌면 안 됨)."""
    async def finder(q, *, x=None, y=None, size=6):
        if q in _DB:
            return [_DB[q]]
        if x is not None:  # 어떤 카테고리든 권역 검색하면 결과가 있다고 가정
            return [Place("z", "권역아무거나", "기타", "", "", 126.9, 33.46, "uz")]
        return []

    plan = {"days": [{
        "accommodation": "애월 숙소",
        "items": [{"name": "성산일출봉"}, {"name": "우도"}, {"name": "없는명소", "category": "명소"}],
    }]}
    card = await build_itinerary(plan, place_finder=finder)
    names = [i["name"] for i in card["days"][0]["items"]]
    assert "없는명소" in names and "권역아무거나" not in names  # 식사가 아니므로 그대로 미확인


async def test_build_keeps_unlocated_when_no_alternative_found():
    """주 식당도 대안도 검색 안 되면 이름만 '위치 확인 필요'로 남긴다(좌표 없음)."""
    plan = {"days": [{
        "accommodation": "애월 숙소",
        "items": [{"name": "성산일출봉"}, {"name": "유령식당", "alternatives": ["또없는집"]}],
    }]}
    card = await build_itinerary(plan, place_finder=_finder)
    g = next(i for i in card["days"][0]["items"] if i["name"] == "유령식당")
    assert "x" not in g and g.get("note") == "위치 확인 필요"


async def test_first_day_does_not_start_from_lodging():
    plan = {"days": [
        {"accommodation": "애월 숙소", "items": [{"name": "성산일출봉"}, {"name": "우도"}]},  # 첫날
        {"accommodation": "애월 숙소", "items": [{"name": "돈사돈"}, {"name": "성산일출봉"}]},  # 둘째날
    ]}
    card = await build_itinerary(plan, place_finder=_finder)
    # 첫날은 숙소가 출발점이 아니므로 출발 핀(acc) 없음
    assert "acc_x" not in card["days"][0]
    # 둘째날부터는 숙소에서 출발(출발 핀)
    assert card["days"][1].get("acc_x") == 126.31


async def test_build_rebiases_region_outlier():
    # '흩어진곳' 첫 결과는 권역에서 멀고(서쪽), 중심 bias를 주면 동부 결과로 바뀐다 → 교정.
    async def finder(q, *, x=None, y=None, size=6):
        if q == "흩어진곳":
            if x is None:
                return [Place("", "흩어진곳", "식당", "", "", 126.49, 33.49, "u")]  # 멀리(서쪽)
            return [Place("", "흩어진곳", "식당", "", "", 126.94, 33.46, "u2")]  # 중심 bias → 동부
        return [_DB[q]] if q in _DB else []

    plan = {"days": [{"items": [{"name": "성산일출봉"}, {"name": "우도"}, {"name": "흩어진곳"}]}]}
    card = await build_itinerary(plan, place_finder=finder)
    o = next(i for i in card["days"][0]["items"] if i["name"] == "흩어진곳")
    assert abs(o["x"] - 126.94) < 0.1  # 권역 중심으로 재검색·교정됨


async def test_build_drops_outlier_region():
    async def finder(q):
        if q == "엉뚱식당":
            return [Place("x", q, "식당", "", "", 126.8, 36.8, "u")]  # 충청
        return await _finder(q)

    plan = {"days": [{"accommodation": "애월 숙소", "items": [{"name": "성산일출봉"}, {"name": "우도"}, {"name": "엉뚱식당"}]}]}
    card = await build_itinerary(plan, place_finder=finder)
    by = {i["name"]: i for i in card["days"][0]["items"]}
    assert "x" not in by["엉뚱식당"]  # 다른 지역은 좌표 없이(동선에서 제외)
