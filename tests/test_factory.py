from tour_agent.factory import build_default_runner, build_room_runner
from tour_agent.kakao import Place
from tour_agent.routing import DailyBudget, RoutingAgentRunner
from tour_agent.state import InMemoryStateStore


class FixedClassifier:
    def __init__(self, kind):
        self.kind = kind

    async def classify(self, prompt):
        return self.kind


class RecordingRunner:
    def __init__(self, name):
        self.name = name
        self.calls = []

    async def run_turn(self, prompt):
        self.calls.append(prompt)
        return f"{self.name}:{prompt}"


def _place(name):
    return Place(name, name, "", "", "", 0.0, 0.0, "")


async def test_simple_path_gets_snapshot_from_store():
    store = InMemoryStateStore()
    state = await store.load("jeju")
    state.destination = "제주"
    state.dates = "6/10~13"
    state.accommodations = [_place("애월펜션")]
    await store.save(state)

    simple = RecordingRunner("simple")
    task = RecordingRunner("task")
    runner = build_room_runner(
        "jeju",
        store,
        classifier=FixedClassifier("simple"),
        simple_runner=simple,
        task_runner=task,
    )

    out = await runner.run_turn("내일 비 와?")

    # store -> 스냅샷 -> 라우팅 -> 단순 경로 주입까지 종단으로 동작한다.
    assert simple.calls[0].startswith("[방 상태]")
    assert "제주" in simple.calls[0]
    assert "6/10~13" in simple.calls[0]
    assert "애월펜션" in simple.calls[0]
    assert "내일 비 와?" in simple.calls[0]
    assert out == f"simple:{simple.calls[0]}"
    assert task.calls == []


async def test_budget_cap_wires_through_factory():
    store = InMemoryStateStore()
    simple = RecordingRunner("simple")
    task = RecordingRunner("task")
    runner = build_room_runner(
        "r",
        store,
        classifier=FixedClassifier("simple"),
        simple_runner=simple,
        task_runner=task,
        budget=DailyBudget(limit=1),
    )

    await runner.run_turn("a")
    blocked = await runner.run_turn("b")

    assert "예산" in blocked
    assert len(simple.calls) == 1


def test_build_default_runner_composes_without_sdk():
    # 프로덕션 합성이 SDK 없이도 만들어진다(LLM 호출 시점에만 SDK 필요).
    store = InMemoryStateStore()
    runner = build_default_runner("r", store, daily_limit=10)
    assert isinstance(runner, RoutingAgentRunner)
