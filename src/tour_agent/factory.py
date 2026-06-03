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
    room_id: str, store: StateStore, *, daily_limit: float = 200
) -> RoutingAgentRunner:
    """프로덕션 기본 합성 — Haiku 분류기 + 단발 러너 + 세션 러너(작업) + 예산 캡.

    각 LLM 러너는 호출 시점에만 SDK를 지연 임포트한다(이 함수는 SDK 없이 import·합성 가능).
    """
    from .agent_runner import (
        HaikuClassifier,
        SessionAgentRunner,
        SingleShotAgentRunner,
    )

    return build_room_runner(
        room_id,
        store,
        classifier=HaikuClassifier(),
        simple_runner=SingleShotAgentRunner(),
        task_runner=SessionAgentRunner(),
        budget=DailyBudget(limit=daily_limit),
    )
