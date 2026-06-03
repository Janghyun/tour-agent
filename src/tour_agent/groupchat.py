"""그룹챗 코어 — 메시지 퍼널링, 명시적 봇 호출 트리거, 디바운스, 방별 세션 락/큐.

LLM(Agent SDK)·FastAPI와 분리된 순수 조정 로직. 결정적으로 테스트 가능하게 둔다.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable, Protocol


@dataclass(frozen=True)
class Message:
    """방에 들어온 한 줄의 발화."""
    speaker: str
    text: str


def funnel(messages: list[Message]) -> str:
    """버퍼된 발화들을 발화자 태그가 붙은 하나의 user 턴으로 합친다."""
    return "\n".join(f"[{m.speaker}] {m.text}" for m in messages)


def is_bot_invocation(text: str) -> bool:
    """이 메시지가 봇을 명시적으로 호출하는가.

    명시적 호출만 인정한다(원칙): `@봇` 멘션 또는 줄 맨 앞의 슬래시 커맨드.
    질문 자동 감지 같은 암묵적 트리거는 하지 않는다.
    """
    return "@봇" in text or text.lstrip().startswith("/")


class AgentRunner(Protocol):
    """LLM 실행 추상화. 프로덕션은 AgentSession 래퍼, 테스트는 페이크."""

    async def run_turn(self, prompt: str) -> str: ...


Broadcast = Callable[[str], Awaitable[None]]


class Room:
    """방 하나의 그룹챗 조정자.

    명시적 호출에만 반응하고, 발화를 퍼널링해 봇 한 턴으로 만든 뒤
    방별 락으로 직렬화해 실행한다. (구현 예정)
    """

    def __init__(
        self,
        room_id: str,
        agent: AgentRunner,
        broadcast: Broadcast,
        *,
        debounce_seconds: float = 1.5,
    ):
        self.room_id = room_id
        self._agent = agent
        self._broadcast = broadcast
        self._debounce = debounce_seconds
        self._buffer: list[Message] = []
        # 방별 세션 락: 동시 query는 SDK 세션 컨텍스트를 깨뜨리므로 반드시 직렬화한다.
        self._lock = asyncio.Lock()
        self._inflight: set[asyncio.Task] = set()

    async def post(self, message: Message) -> None:
        """발화 하나를 받는다. 즉시 반환한다(논블로킹)."""
        self._buffer.append(message)
        if is_bot_invocation(message.text):
            self._track(asyncio.create_task(self._debounced_turn()))

    def _track(self, task: asyncio.Task) -> None:
        self._inflight.add(task)
        task.add_done_callback(self._inflight.discard)

    async def _debounced_turn(self) -> None:
        await asyncio.sleep(self._debounce)
        await self._run_turn()

    async def _run_turn(self) -> None:
        async with self._lock:
            msgs, self._buffer = self._buffer, []
            if not msgs:
                return
            reply = await self._agent.run_turn(funnel(msgs))
            await self._broadcast(reply)

    async def wait_idle(self) -> None:
        """진행 중인 모든 봇 작업이 끝날 때까지 기다린다(테스트·종료용)."""
        while self._inflight:
            await asyncio.gather(*list(self._inflight), return_exceptions=True)
