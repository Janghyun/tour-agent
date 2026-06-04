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


def present_tools(emit: CardSink) -> list[ToolSpec]:
    """방의 카드 싱크(emit)에 묶인 present_* ToolSpec들을 만든다."""

    def _card_tool(name: str, card_type: str, description: str, schema: dict) -> ToolSpec:
        async def handler(args: dict) -> str:
            await emit({"type": card_type, **args})
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
    ]
