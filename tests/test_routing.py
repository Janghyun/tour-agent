import pytest

from tour_agent.routing import (
    BudgetExceeded,
    DailyBudget,
    HeuristicClassifier,
    RoutingAgentRunner,
)


class FixedClassifier:
    def __init__(self, kind: str):
        self.kind = kind
        self.seen: list[str] = []

    async def classify(self, prompt: str) -> str:
        self.seen.append(prompt)
        return self.kind


class RecordingRunner:
    def __init__(self, name: str):
        self.name = name
        self.calls: list[str] = []

    async def run_turn(self, prompt: str) -> str:
        self.calls.append(prompt)
        return f"{self.name}:{prompt}"


async def test_simple_query_routed_to_simple_runner():
    simple = RecordingRunner("simple")
    task = RecordingRunner("task")
    runner = RoutingAgentRunner(FixedClassifier("simple"), simple, task)

    out = await runner.run_turn("내일 비 와?")

    assert simple.calls == ["내일 비 와?"]
    assert task.calls == []
    assert out == "simple:내일 비 와?"


async def test_task_request_routed_to_task_runner():
    simple = RecordingRunner("simple")
    task = RecordingRunner("task")
    runner = RoutingAgentRunner(FixedClassifier("task"), simple, task)

    out = await runner.run_turn("@봇 3박4일 일정 짜줘")

    assert task.calls == ["@봇 3박4일 일정 짜줘"]
    assert simple.calls == []
    assert out == "task:@봇 3박4일 일정 짜줘"


async def test_simple_path_injects_room_snapshot():
    simple = RecordingRunner("simple")
    task = RecordingRunner("task")

    async def snapshot() -> str:
        return "제주 / 6/10~13 / 숙소: 애월"

    runner = RoutingAgentRunner(
        FixedClassifier("simple"), simple, task, snapshot_provider=snapshot
    )

    await runner.run_turn("내일 비 와?")

    assert simple.calls == ["[방 상태]\n제주 / 6/10~13 / 숙소: 애월\n\n내일 비 와?"]


async def test_task_path_does_not_inject_snapshot():
    simple = RecordingRunner("simple")
    task = RecordingRunner("task")

    async def snapshot() -> str:
        return "제주 / 6/10~13 / 숙소: 애월"

    runner = RoutingAgentRunner(
        FixedClassifier("task"), simple, task, snapshot_provider=snapshot
    )

    await runner.run_turn("@봇 일정 짜줘")

    # 작업 경로는 세션이 직접 맥락을 구성하므로 스냅샷을 주입하지 않는다.
    assert task.calls == ["@봇 일정 짜줘"]


async def test_budget_blocks_when_daily_limit_exceeded():
    simple = RecordingRunner("simple")
    task = RecordingRunner("task")
    budget = DailyBudget(limit=2)
    runner = RoutingAgentRunner(
        FixedClassifier("simple"), simple, task, budget=budget
    )

    assert (await runner.run_turn("a")).startswith("simple:")
    assert (await runner.run_turn("b")).startswith("simple:")
    blocked = await runner.run_turn("c")  # 3번째 — 한도 2 초과

    assert "예산" in blocked  # 예산 소진 안내 메시지
    assert simple.calls == ["a", "b"]  # 초과분은 에이전트를 호출하지 않음


async def test_budget_resets_on_new_day():
    simple = RecordingRunner("simple")
    task = RecordingRunner("task")
    day = ["2026-06-04"]
    budget = DailyBudget(limit=1, day_key=lambda: day[0])
    runner = RoutingAgentRunner(
        FixedClassifier("simple"), simple, task, budget=budget
    )

    assert (await runner.run_turn("a")).startswith("simple:")
    assert "예산" in await runner.run_turn("b")  # 같은 날 한도 초과

    day[0] = "2026-06-05"  # 다음 날
    assert (await runner.run_turn("c")).startswith("simple:")  # 리셋되어 다시 허용


def test_budget_charge_raises_when_exceeded():
    budget = DailyBudget(limit=1)
    budget.charge()
    with pytest.raises(BudgetExceeded):
        budget.charge()


async def test_heuristic_classifier_routes_task_on_slash_command():
    c = HeuristicClassifier()
    assert await c.classify("/일정 짜줘") == "task"
    assert await c.classify("/검색 흑돼지") == "task"


async def test_heuristic_classifier_routes_task_on_keywords():
    c = HeuristicClassifier()
    assert await c.classify("@봇 제주 맛집 검색해줘") == "task"
    assert await c.classify("3박4일 코스 추천해줘") == "task"
    assert await c.classify("동선 고려해서 일정 짜줘") == "task"


async def test_heuristic_classifier_routes_task_on_search_intent():
    c = HeuristicClassifier()
    assert await c.classify("흑돼지 맛집 알려줘") == "task"
    assert await c.classify("근처 카페 어디 있어?") == "task"
    assert await c.classify("제주 명소 구경하고 싶어") == "task"


async def test_heuristic_classifier_routes_simple_on_smalltalk():
    c = HeuristicClassifier()
    assert await c.classify("안녕하세요") == "simple"
    assert await c.classify("고마워요") == "simple"
    assert await c.classify("우도 날씨 어때?") == "simple"
