"""검증된 조각들을 방 단위 에이전트 파이프라인으로 합성한다.

Room(그룹챗 코어) → RoutingAgentRunner(게이트 B) → 단순/작업 러너
                                              ↘ 방 상태 스냅샷(StateStore)

LLM 러너·분류기는 주입한다(프로덕션=SDK 구현, 테스트=페이크). 합성 자체는 검증 가능하다.
"""

from __future__ import annotations

import datetime
from zoneinfo import ZoneInfo

from .routing import DailyBudget, HeuristicClassifier, RoutingAgentRunner
from .state import StateStore, room_snapshot

_KST = ZoneInfo("Asia/Seoul")


def build_room_runner(
    room_id: str,
    store: StateStore,
    *,
    classifier,
    simple_runner,
    task_runner,
    budget: DailyBudget | None = None,
) -> RoutingAgentRunner:
    """방 하나의 라우팅 러너를 만든다. 스냅샷은 StateStore에서 끌어온다."""

    async def snapshot() -> str:
        base = room_snapshot(await store.load(room_id))
        # 봇은 시계가 없어 연도·요일을 모른다 → 오늘 날짜(KST)를 줘서 올해 기준으로 계산하게 한다.
        today = datetime.datetime.now(_KST).strftime("%Y-%m-%d(%a) KST")
        head = f"오늘: {today}"
        return f"{head}\n{base}" if base else head

    return RoutingAgentRunner(
        classifier,
        simple_runner,
        task_runner,
        snapshot_provider=snapshot,
        budget=budget,
    )


def build_default_runner(
    room_id: str,
    store: StateStore,
    *,
    backend: str = "api",
    daily_limit: float = 200,
    model: str = "claude-sonnet-4-6",
    model_client=None,
    emit_card=None,
    kakao_client=None,
) -> RoutingAgentRunner:
    """프로덕션 기본 합성 — 분류기 + 단순/작업 러너 + 예산 캡.

    ``backend`` 로 실행 경로를 고른다:
      - ``"api"`` (기본, 외부 출시): Messages API. 분류기 ``ApiClassifier`` + ``ApiAgentRunner``.
        실제 Anthropic 호출은 ``model_client`` 로 주입(기본은 anthropic_model_client, 호출 시점에만
        anthropic 임포트). 이 함수는 SDK·anthropic 없이도 import·합성된다.
      - ``"cli"`` (로컬·개발): Agent SDK/구독. LLM 분류 호출을 아끼려 ``HeuristicClassifier`` 를
        쓰고, 단순/작업 모두 ``CliAgentRunner``. ``model`` 을 전달해 모델을 고정한다(미지정 시
        구독 기본=Opus라 느리고 비싸므로, 기본값 sonnet으로 맞춘다).

    ``emit_card`` 가 주어지면 작업 경로에 present_* 카드 툴을 붙인다(방 브로드캐스트로 연결).
    ``kakao_client`` 가 있으면 검색·동선 입력 툴을, 없으면 order_route(순수)만 붙인다.
    """
    from .cards import present_tools
    from .prompts import ORCHESTRATOR_SYSTEM, SIMPLE_SYSTEM
    from .tools import build_input_tools, order_route_toolspec

    input_tools = (
        build_input_tools(kakao_client)
        if kakao_client is not None
        else [order_route_toolspec()]
    )
    # 일정 카드의 장소를 실제 검색해 좌표·링크를 보강(봇이 지어낸 좌표 대신 실데이터).
    _place_finder = (lambda q: kakao_client.keyword_search(q)) if kakao_client is not None else None
    # 인접 장소 간 실제 차량 이동시간(compose_itinerary가 사용).
    _route_finder = (lambda o, d: kakao_client.directions(o, d)) if kakao_client is not None else None
    card_tools = (
        present_tools(emit_card, place_finder=_place_finder, route_finder=_route_finder)
        if emit_card is not None
        else []
    )
    task_tools = [*input_tools, *card_tools]

    if backend == "cli":
        from .cli_runner import CliAgentRunner

        return build_room_runner(
            room_id,
            store,
            classifier=HeuristicClassifier(),
            simple_runner=CliAgentRunner([], SIMPLE_SYSTEM, model=model),
            task_runner=CliAgentRunner(task_tools, ORCHESTRATOR_SYSTEM, model=model),
            budget=DailyBudget(limit=daily_limit),
        )

    from .api_runner import ApiAgentRunner, ApiClassifier, anthropic_model_client

    mc = model_client or anthropic_model_client(model)
    return build_room_runner(
        room_id,
        store,
        classifier=ApiClassifier(mc),
        simple_runner=ApiAgentRunner(mc, [], SIMPLE_SYSTEM, max_steps=3),
        task_runner=ApiAgentRunner(mc, task_tools, ORCHESTRATOR_SYSTEM),
        budget=DailyBudget(limit=daily_limit),
    )
