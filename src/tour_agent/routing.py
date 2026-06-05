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


class HeuristicClassifier:
    """LLM 없이 키워드로 단순/작업을 분기한다(CLI·오프라인 경로용).

    분류만을 위해 별도 LLM을 호출하지 않으려는 경로에서 쓴다. 슬래시 커맨드나
    일정·검색 관련 단서가 있으면 작업(task), 그 외 잡담·단순 질의는 simple.
    """

    TASK_HINTS = (
        "/일정", "/검색", "/추천", "/비교", "/확정",
        "일정", "검색", "찾아", "추천", "코스", "동선", "짜줘", "짜 줘",
        "담아", "비교", "확정",
        # 장소 검색·추천 의도(봇을 명시 호출한 뒤라 관대하게 작업으로 보낸다)
        "맛집", "카페", "명소", "근처", "어디", "가볼", "갈만", "알려", "구경", "들를",
    )

    async def classify(self, prompt: str) -> str:
        return "task" if any(h in prompt for h in self.TASK_HINTS) else "simple"


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
        import time

        t0 = time.monotonic()
        if self._budget is not None:
            try:
                self._budget.charge()
            except BudgetExceeded:
                # 분류 호출 비용도 아끼려고 분기 전에 막는다.
                return BUDGET_MESSAGE
        kind = await self._classifier.classify(prompt)
        # 두 경로 모두 방 상태 스냅샷을 주입한다 — 작업 경로도 후보 풀·숙소를 알아야
        # '담은 후보로' 일정을 짤 수 있다(상태 조회 툴이 별도로 없으므로).
        prompt_with_state = await self._with_snapshot(prompt)
        runner = self._simple if kind == "simple" else self._task
        out = await runner.run_turn(prompt_with_state)
        print(f"[봇] {kind} 응답 {time.monotonic() - t0:.1f}초", flush=True)
        return out

    async def _with_snapshot(self, prompt: str) -> str:
        if self._snapshot is None:
            return prompt
        snapshot = await self._snapshot()
        if not snapshot:
            return prompt
        return f"[방 상태]\n{snapshot}\n\n{prompt}"
