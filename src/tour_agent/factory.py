"""검증된 조각들을 방 단위 에이전트 파이프라인으로 합성한다.

Room(그룹챗 코어) → RoutingAgentRunner(게이트 B) → 단순/작업 러너
                                              ↘ 방 상태 스냅샷(StateStore)

LLM 러너·분류기는 주입한다(프로덕션=SDK 구현, 테스트=페이크). 합성 자체는 검증 가능하다.
"""

from __future__ import annotations

from .routing import DailyBudget, RoutingAgentRunner
from .state import StateStore, room_snapshot


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
        return room_snapshot(await store.load(room_id))

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
    daily_limit: float = 200,
    model: str = "claude-sonnet-4-6",
    model_client=None,
    emit_card=None,
    kakao_client=None,
) -> RoutingAgentRunner:
    """프로덕션 기본 합성 (Messages API 경로) — 분류기 + 단순/작업 러너 + 예산 캡.

    실제 Anthropic 호출은 ``model_client`` 로 주입(기본은 anthropic_model_client, 호출 시점에만
    anthropic 임포트). 이 함수는 SDK·anthropic 없이도 import·합성된다.
    ``emit_card`` 가 주어지면 작업 경로에 present_* 카드 툴을 붙인다(방 브로드캐스트로 연결).
    Kakao·order_route 입력 툴은 다음 단계에서 추가.
    """
    from .api_runner import ApiAgentRunner, ApiClassifier, anthropic_model_client
    from .cards import present_tools
    from .prompts import ORCHESTRATOR_SYSTEM, SIMPLE_SYSTEM
    from .tools import build_input_tools, order_route_toolspec

    mc = model_client or anthropic_model_client(model)
    input_tools = (
        build_input_tools(kakao_client)
        if kakao_client is not None
        else [order_route_toolspec()]
    )
    card_tools = present_tools(emit_card) if emit_card is not None else []
    task_tools = [*input_tools, *card_tools]
    return build_room_runner(
        room_id,
        store,
        classifier=ApiClassifier(mc),
        simple_runner=ApiAgentRunner(mc, [], SIMPLE_SYSTEM, max_steps=3),
        task_runner=ApiAgentRunner(mc, task_tools, ORCHESTRATOR_SYSTEM),
        budget=DailyBudget(limit=daily_limit),
    )
