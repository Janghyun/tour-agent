"""present_* 카드 계약 — 에이전트 → 프론트 구조화 출력.

에이전트가 present_* 툴을 호출하면, 핸들러가 카드 페이로드를 ``emit`` 으로 방출하고
모델에는 짧은 확인만 돌려준다. 프론트는 이 페이로드를 카드로 렌더한다(텍스트 파싱 금지).

카드 종류: 장소 옵션 / 일정 타임라인 / 지도. (옵션 비교는 추후)
"""

from __future__ import annotations

from typing import Awaitable, Callable

from .api_runner import ToolSpec

CardSink = Callable[[dict], Awaitable[None]]

PLACE_OPTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "options": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "category": {"type": "string"},
                    "address": {"type": "string"},
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                    "distance_m": {"type": "number"},
                    "phone": {"type": "string"},
                    "place_url": {"type": "string"},
                    "note": {"type": "string"},
                },
                "required": ["name"],
            },
        },
    },
    "required": ["options"],
}

ITINERARY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "days": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "accommodation": {"type": "string"},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "time": {"type": "string"},
                                "name": {"type": "string"},
                                "category": {"type": "string"},
                                "x": {"type": "number"},
                                "y": {"type": "number"},
                                "place_url": {"type": "string"},
                                "travel_from_prev": {"type": "string"},
                            },
                            "required": ["name"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    },
    "required": ["days"],
}

COMPARE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "subtitle": {"type": "string"},
        "slot": {"type": "string"},  # 어느 슬롯의 대안인지(예: "1일차 점심")
        "options": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "category": {"type": "string"},
                    "note": {"type": "string"},  # 한 줄 비교 포인트
                    "pros": {"type": "array", "items": {"type": "string"}},
                    "cons": {"type": "array", "items": {"type": "string"}},
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                },
                "required": ["name"],
            },
        },
    },
    "required": ["options"],
}

COMPOSE_ITINERARY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "days": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "accommodation": {"type": "string"},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "category": {"type": "string"},
                                "meal": {"type": "string"},  # lunch/dinner 등(선택)
                                "alternatives": {  # 식사 슬롯의 대안 맛집 이름 2~3곳(선택)
                                    "type": "array",
                                    "items": {"type": "string"},
                                },
                            },
                            "required": ["name"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    },
    "required": ["days"],
}

MAP_SCHEMA = {
    "type": "object",
    "properties": {
        "center": {
            "type": "object",
            "properties": {"x": {"type": "number"}, "y": {"type": "number"}},
        },
        "pins": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "x": {"type": "number"},
                    "y": {"type": "number"},
                    "category": {"type": "string"},
                    "order": {"type": "number"},
                },
                "required": ["name", "x", "y"],
            },
        },
        "route": {
            "type": "array",
            "items": {"type": "array", "items": {"type": "number"}},
        },
    },
    "required": ["pins"],
}


async def _enrich_itinerary(card: dict, place_finder) -> None:
    """일정 카드의 각 항목·숙소를 실제 검색해 좌표·링크를 채운다(봇이 지어낸 좌표 대신 실데이터).

    - 이름으로 첫 검색 결과를 쓰되, 전체 좌표의 중심에서 크게 벗어난 이상치(동명의 다른 지역)는
      좌표를 넣지 않는다(예: 제주 일정에 충청도 동명 가게가 잡히는 경우).
    - 숙소(day.accommodation)도 검색해 day.acc_x/acc_y로 둔다(지도에 출발 핀 표시용).
    """
    import asyncio
    import statistics

    days = card.get("days", [])
    items = [
        it
        for day in days
        for it in day.get("items", [])
        if isinstance(it, dict) and it.get("name")
    ]
    acc_days = [d for d in days if isinstance(d, dict) and d.get("accommodation")]

    async def first(name: str):
        try:
            r = await place_finder(name)
        except Exception:  # noqa: BLE001 - 개별 실패는 무시
            return None
        return r[0] if r else None

    item_firsts = list(await asyncio.gather(*(first(it["name"]) for it in items))) if items else []
    acc_firsts = list(await asyncio.gather(*(first(d["accommodation"]) for d in acc_days))) if acc_days else []

    coords = [(p.x, p.y) for p in [*item_firsts, *acc_firsts] if p and p.x and p.y]
    if not coords:
        return
    cx = statistics.median(c[0] for c in coords)
    cy = statistics.median(c[1] for c in coords)

    def near(p) -> bool:  # 같은 여행 지역인지(중심에서 ~0.7도 이내)
        return bool(p and p.x and p.y and abs(p.x - cx) <= 0.7 and abs(p.y - cy) <= 0.7)

    for it, p in zip(items, item_firsts):
        if not near(p):
            continue
        it["x"], it["y"] = p.x, p.y
        if not it.get("place_url"):
            it["place_url"] = p.place_url
        if not it.get("category"):
            it["category"] = p.category

    for d, p in zip(acc_days, acc_firsts):
        if near(p):
            d["acc_x"], d["acc_y"] = p.x, p.y


def present_tools(emit: CardSink, *, place_finder=None, route_finder=None) -> list[ToolSpec]:
    """방의 카드 싱크(emit)에 묶인 present_* ToolSpec들을 만든다.

    ``place_finder`` 가 주어지면 일정 카드의 장소를 실제 검색해 좌표·링크를 보강하고,
    ``compose_itinerary`` 툴(봇은 장소 목록만, 좌표·동선·시간은 코드가 조립)을 추가로 노출한다.
    """

    def _card_tool(name: str, card_type: str, description: str, schema: dict) -> ToolSpec:
        async def handler(args: dict) -> str:
            card = {"type": card_type, **args}
            if card_type == "itinerary" and place_finder is not None:
                await _enrich_itinerary(card, place_finder)
            await emit(card)
            return f"{card_type} 카드를 표시했습니다."

        return ToolSpec(name, description, schema, handler)

    async def _compose_handler(args: dict) -> str:
        from .itinerary_build import build_itinerary

        card = await build_itinerary(args, place_finder=place_finder, route_finder=route_finder)
        await emit(card)
        return "itinerary 카드를 표시했습니다."

    extra: list[ToolSpec] = []
    if place_finder is not None:
        extra.append(ToolSpec(
            "compose_itinerary",
            "일정을 만든다(권장). 날짜별 장소 이름 목록만 넘기면 좌표·동선·이동시간·시간표를 "
            "시스템이 실제 데이터로 채워 카드로 보여준다. 좌표·시간을 직접 쓰지 말 것.",
            COMPOSE_ITINERARY_SCHEMA,
            _compose_handler,
        ))

    return [
        _card_tool(
            "present_place_options",
            "place_options",
            "검색한 장소 후보들을 카드로 보여준다(사용자가 '추가'로 후보 풀에 담음)",
            PLACE_OPTIONS_SCHEMA,
        ),
        _card_tool(
            "present_itinerary",
            "itinerary",
            "구성한 일정을 날짜·시각 타임라인 카드로 보여준다",
            ITINERARY_SCHEMA,
        ),
        _card_tool(
            "present_map",
            "map",
            "장소 핀과 동선을 지도 카드로 보여준다",
            MAP_SCHEMA,
        ),
        _card_tool(
            "present_compare",
            "compare",
            "한 슬롯의 대안 2~3곳을 나란히 비교 카드로 보여준다(사용자가 하나를 골라 후보에 담음)",
            COMPARE_SCHEMA,
        ),
        *extra,
    ]
