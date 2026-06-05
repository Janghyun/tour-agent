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


async def test_snapshot_includes_today_for_weekday_calc():
    store = InMemoryStateStore()
    simple = RecordingRunner("simple")
    runner = build_room_runner(
        "r", store,
        classifier=FixedClassifier("simple"),
        simple_runner=simple,
        task_runner=RecordingRunner("task"),
    )
    await runner.run_turn("안녕")
    # 봇이 연도·요일을 올해 기준으로 계산하도록 스냅샷에 '오늘' 날짜가 들어간다.
    assert "오늘:" in simple.calls[0]


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


def test_build_default_runner_cli_backend_uses_cli_and_heuristic():
    # CLI(구독) 경로: 휴리스틱 분류기 + CliAgentRunner(단순/작업). SDK 없이도 합성된다.
    from tour_agent.cli_runner import CliAgentRunner
    from tour_agent.routing import HeuristicClassifier

    store = InMemoryStateStore()
    runner = build_default_runner("r", store, backend="cli", model="claude-sonnet-4-6")

    assert isinstance(runner, RoutingAgentRunner)
    assert isinstance(runner._classifier, HeuristicClassifier)
    assert isinstance(runner._simple, CliAgentRunner)
    assert isinstance(runner._task, CliAgentRunner)
    # cli 러너도 지정 모델을 따른다(미지정 시 구독 기본=Opus를 피하고 sonnet 고정).
    assert runner._simple._model == "claude-sonnet-4-6"
    assert runner._task._model == "claude-sonnet-4-6"


async def test_task_path_emits_card_through_factory():
    store = InMemoryStateStore()
    emitted = []

    async def emit_card(card):
        emitted.append(card)

    state = {"task_calls": 0}

    async def model(messages, tools, system):
        if not tools:  # 분류기 호출(툴 없음) → 작업으로 분류
            return {"stop_reason": "end_turn", "content": [{"type": "text", "text": "task"}]}
        state["task_calls"] += 1
        if state["task_calls"] == 1:  # 작업 러너: present_itinerary 호출
            return {
                "stop_reason": "tool_use",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "t1",
                        "name": "present_itinerary",
                        "input": {"title": "제주", "days": [{"items": [{"name": "우도"}]}]},
                    }
                ],
            }
        return {"stop_reason": "end_turn", "content": [{"type": "text", "text": "완성"}]}

    runner = build_default_runner("r", store, model_client=model, emit_card=emit_card)
    out = await runner.run_turn("@봇 일정 짜줘")

    assert out == "완성"
    assert emitted and emitted[0]["type"] == "itinerary"
    assert emitted[0]["title"] == "제주"
