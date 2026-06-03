"""프로덕션 AgentRunner 어댑터 — 방별 AgentSession을 그룹챗 코어에 연결한다.

groupchat.Room 은 ``AgentRunner`` 프로토콜(``run_turn(prompt) -> str``)만 안다.
여기서 그 프로토콜을 실제 Claude Agent SDK 세션으로 구현한다.

※ Claude Agent SDK는 **지연 임포트**한다. 이 모듈을 import하는 것만으로 SDK가
  필요해지지 않도록(테스트는 SDK 없이 돌아간다) 한다. SDK·API 키가 있어야 실제로 실행된다.
※ 방마다 러너 하나 = AgentSession 하나(멀티턴). 동시 query는 세션을 깨뜨리므로
  Room의 방별 락이 .ask() 호출을 직렬화해 준다.
"""

from __future__ import annotations

from typing import Any


class SessionAgentRunner:
    """방 하나의 멀티턴 AgentSession을 감싼다. 첫 턴에서 세션을 열고 재사용한다."""

    def __init__(self, cfg: Any = None):
        self._cfg = cfg
        self._session: Any = None

    async def _ensure_session(self) -> Any:
        if self._session is None:
            # 지연 임포트: SDK가 없으면 여기서만 실패한다.
            from .agent_backend import AgentConfig, AgentSession, Backend

            cfg = self._cfg or AgentConfig()
            self._session = AgentSession(cfg, Backend.from_env())
            await self._session.__aenter__()
        return self._session

    async def run_turn(self, prompt: str) -> str:
        session = await self._ensure_session()
        result = ""
        async for message in session.ask(prompt):
            if hasattr(message, "result") and message.result:
                result = message.result
        return result

    async def aclose(self) -> None:
        if self._session is not None:
            await self._session.__aexit__(None, None, None)
            self._session = None


class SingleShotAgentRunner:
    """단순 질의용 단발 러너 — query() 1회. (라우팅 게이트의 simple 경로)

    방 상태 스냅샷은 RoutingAgentRunner가 프롬프트에 이미 주입해 넘긴다.
    """

    _SYSTEM = (
        "당신은 여행 도우미입니다. 방 상태가 주어지면 그 맥락(목적지·날짜·확정 일정)을 "
        "반영해 간결히 답하세요. 맥락으로도 모호하면 한 가지만 되물으세요."
    )

    def __init__(self, model: str = "claude-haiku-4-5-20251001"):
        self._model = model

    async def run_turn(self, prompt: str) -> str:
        from .agent_backend import AgentConfig, Backend, run_once

        cfg = AgentConfig(
            system_prompt=self._SYSTEM,
            allowed_tools=["WebSearch"],
            model=self._model,
            max_turns=3,
        )
        return await run_once(prompt, cfg, Backend.from_env())


class HaikuClassifier:
    """단순/작업 분류를 Haiku 단발로 수행하는 프로덕션 Classifier.

    'simple'(짧은 질의/잡담) 또는 'task'(일정 설계·검색·검증 등 도구·다단계 필요)를 반환.
    """

    _SYSTEM = (
        "너는 여행 그룹챗 봇의 라우터다. 사용자 메시지가 단순 질의인지 작업 요청인지 분류해라. "
        "도구 사용이나 여러 단계가 필요한 일정 설계·장소 검색·동선 검증 등은 'task', "
        "한두 문장으로 답할 수 있는 잡담·단순 질의는 'simple'. "
        "오직 'simple' 또는 'task' 한 단어만 출력해라."
    )

    def __init__(self, model: str = "claude-haiku-4-5-20251001"):
        self._model = model

    async def classify(self, prompt: str) -> str:
        from .agent_backend import AgentConfig, Backend, run_once

        cfg = AgentConfig(
            system_prompt=self._SYSTEM,
            allowed_tools=[],
            model=self._model,
            max_turns=1,
        )
        out = (await run_once(prompt, cfg, Backend.from_env())).strip().lower()
        return "task" if "task" in out else "simple"
