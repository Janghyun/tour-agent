"""응답 라우팅 게이트(게이트 B) — 게이트 A를 통과한 호출을 단순/작업으로 분기.

- 단순 질의 -> 단발 러너(run_once). 방 상태 스냅샷을 주입해 맥락 있는 답.
- 작업 요청 -> 풀 세션 러너(서브에이전트 위임).
- 방별 일일 예산 캡으로 초과 호출을 막는다.

기존 ``AgentRunner`` 프로토콜(run_turn(prompt)->str) 위에 합성한다.
"""

from __future__ import annotations

import datetime
from typing import Awaitable, Callable, Protocol

BUDGET_MESSAGE = "오늘 이 방의 봇 사용 예산을 다 썼어요. 내일 다시 시도해 주세요."


def _today() -> str:
    return datetime.date.today().isoformat()


class Classifier(Protocol):
    """단순 질의/작업 요청 분류. 'simple' 또는 'task'를 반환. (프로덕션=Haiku 단발)"""

    async def classify(self, prompt: str) -> str: ...


SnapshotProvider = Callable[[], Awaitable[str]]


class BudgetExceeded(Exception):
    pass


class DailyBudget:
    """방 단위 일일 예산. 매 턴 ``charge`` 하고, 한도 초과 시 ``BudgetExceeded``.

    ``cost_per_turn`` 으로 토큰/비용 단위를 추상화한다(기본 1 = 턴 수 기준).
    실제 토큰 회계는 ``charge(amount=usage)`` 로 꽂으면 된다.
    ``day_key`` 는 '오늘'을 가리키는 키(기본 로컬 날짜). 키가 바뀌면 사용량을 리셋한다.
    """

    def __init__(
        self,
        limit: float,
        *,
        cost_per_turn: float = 1,
        day_key: Callable[[], str] | None = None,
    ):
        self._limit = limit
        self._cost = cost_per_turn
        self._day_key = day_key or _today
        self._day = self._day_key()
        self._spent: float = 0

    def charge(self, amount: float | None = None) -> None:
        amount = self._cost if amount is None else amount
        day = self._day_key()
        if day != self._day:  # 날짜가 바뀌면 리셋
            self._day = day
            self._spent = 0
        if self._spent + amount > self._limit:
            raise BudgetExceeded()
        self._spent += amount

    @property
    def spent(self) -> float:
        return self._spent


class RoutingAgentRunner:
    """(자리만 — 구현 예정)"""

    def __init__(
        self,
        classifier,
        simple_runner,
        task_runner,
        *,
        snapshot_provider: SnapshotProvider | None = None,
        budget: "DailyBudget | None" = None,
    ):
        self._classifier = classifier
        self._simple = simple_runner
        self._task = task_runner
        self._snapshot = snapshot_provider
        self._budget = budget

    async def run_turn(self, prompt: str) -> str:
        if self._budget is not None:
            try:
                self._budget.charge()
            except BudgetExceeded:
                # 분류 호출 비용도 아끼려고 분기 전에 막는다.
                return BUDGET_MESSAGE
        kind = await self._classifier.classify(prompt)
        if kind == "simple":
            return await self._simple.run_turn(await self._with_snapshot(prompt))
        return await self._task.run_turn(prompt)

    async def _with_snapshot(self, prompt: str) -> str:
        if self._snapshot is None:
            return prompt
        snapshot = await self._snapshot()
        if not snapshot:
            return prompt
        return f"[방 상태]\n{snapshot}\n\n{prompt}"
