import asyncio

from tour_agent.groupchat import Message, Room, funnel, is_bot_invocation


class RecordingAgent:
    """호출된 프롬프트를 기록하는 테스트용 AgentRunner."""

    def __init__(self):
        self.calls: list[str] = []

    async def run_turn(self, prompt: str) -> str:
        self.calls.append(prompt)
        return f"답변: {prompt}"


class GatedAgent:
    """run_turn이 release될 때까지 멈춰 있어, 긴 작업을 결정적으로 재현한다."""

    def __init__(self):
        self.calls: list[str] = []
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.max_concurrent = 0
        self._current = 0

    async def run_turn(self, prompt: str) -> str:
        self._current += 1
        self.max_concurrent = max(self.max_concurrent, self._current)
        self.calls.append(prompt)
        self.started.set()
        await self.release.wait()
        self._current -= 1
        return f"답변: {prompt}"


def test_at_mention_triggers_bot():
    assert is_bot_invocation("@봇 일정 짜줘") is True


def test_slash_command_triggers_bot():
    assert is_bot_invocation("/일정 짜줘") is True


def test_funnel_tags_each_speaker():
    msgs = [Message("민수", "우도 갈까?"), Message("영희", "좋아")]
    assert funnel(msgs) == "[민수] 우도 갈까?\n[영희] 좋아"


async def test_explicit_invocation_runs_agent_with_funneled_context():
    agent = RecordingAgent()
    sent: list[str] = []

    async def broadcast(text: str) -> None:
        sent.append(text)

    room = Room("r1", agent, broadcast, debounce_seconds=0.01)
    await room.post(Message("민수", "우도 갈까?"))
    await room.post(Message("영희", "@봇 일정 짜줘"))
    await room.wait_idle()

    assert agent.calls == ["[민수] 우도 갈까?\n[영희] @봇 일정 짜줘"]
    assert sent == ["답변: [민수] 우도 갈까?\n[영희] @봇 일정 짜줘"]


async def test_plain_messages_never_trigger_agent():
    agent = RecordingAgent()
    sent: list[str] = []

    async def broadcast(text: str) -> None:
        sent.append(text)

    room = Room("r1", agent, broadcast, debounce_seconds=0.01)
    await room.post(Message("민수", "우도 갈까?"))
    await room.post(Message("영희", "민수야 너 회 좋아해?"))
    await room.wait_idle()

    assert agent.calls == []
    assert sent == []


async def test_debounce_coalesces_messages_within_window():
    agent = RecordingAgent()
    sent: list[str] = []

    async def broadcast(text: str) -> None:
        sent.append(text)

    room = Room("r1", agent, broadcast, debounce_seconds=0.05)
    await room.post(Message("민수", "@봇 일정 짜줘"))
    await asyncio.sleep(0.02)  # 디바운스 창 안
    await room.post(Message("영희", "우도도 넣어줘"))
    await room.wait_idle()

    # 창 안의 발화가 한 턴으로 합쳐져 에이전트는 단 한 번 호출된다.
    assert agent.calls == ["[민수] @봇 일정 짜줘\n[영희] 우도도 넣어줘"]


async def test_serialized_nonblocking_and_queue_during_long_turn():
    agent = GatedAgent()
    sent: list[str] = []

    async def broadcast(text: str) -> None:
        sent.append(text)

    room = Room("r1", agent, broadcast, debounce_seconds=0.0)

    # 첫 호출 -> 긴 턴 시작(릴리스될 때까지 멈춤)
    await room.post(Message("민수", "@봇 일정 짜줘"))
    await asyncio.wait_for(agent.started.wait(), 1)

    # 작업 중에도 사람은 계속 떠들 수 있고(논블로킹), 새 호출은 큐잉된다.
    await room.post(Message("영희", "ㅋㅋ"))
    await room.post(Message("철수", "@봇 우도도 넣어줘"))
    await asyncio.sleep(0.02)
    assert len(agent.calls) == 1  # 앞 작업이 안 끝났으니 둘째 턴은 아직 시작 안 됨

    agent.release.set()  # 첫 턴 완료 -> 큐 처리
    await room.wait_idle()

    assert agent.max_concurrent == 1  # 방별 락으로 직렬화
    assert agent.calls == [
        "[민수] @봇 일정 짜줘",
        "[영희] ㅋㅋ\n[철수] @봇 우도도 넣어줘",
    ]
