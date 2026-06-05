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
    """일정 카드의 각 항목을 실제 검색해 좌표·링크를 채운다(봇이 지어낸 좌표 대신 실데이터).

    이름으로 첫 검색 결과를 쓴다. 병렬 처리. 검색 실패/무결과 항목은 그대로 둔다.
    """
    import asyncio

    items = [
        it
        for day in card.get("days", [])
        for it in day.get("items", [])
        if isinstance(it, dict) and it.get("name")
    ]

    async def fill(it: dict) -> None:
        try:
            results = await place_finder(it["name"])
        except Exception:  # noqa: BLE001 - 개별 실패는 무시(그 항목만 좌표 없음)
            return
        if not results:
            return
        p = results[0]
        it["x"], it["y"] = p.x, p.y
        if not it.get("place_url"):
            it["place_url"] = p.place_url
        if not it.get("category"):
            it["category"] = p.category

    if items:
        await asyncio.gather(*(fill(it) for it in items))


def present_tools(emit: CardSink, *, place_finder=None) -> list[ToolSpec]:
    """방의 카드 싱크(emit)에 묶인 present_* ToolSpec들을 만든다.

    ``place_finder`` 가 주어지면 일정 카드의 각 장소를 실제 검색해 좌표·링크를 보강한다.
    """

    def _card_tool(name: str, card_type: str, description: str, schema: dict) -> ToolSpec:
        async def handler(args: dict) -> str:
            card = {"type": card_type, **args}
            if card_type == "itinerary" and place_finder is not None:
                await _enrich_itinerary(card, place_finder)
            await emit(card)
            return f"{card_type} 카드를 표시했습니다."

        return ToolSpec(name, description, schema, handler)

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
    ]
