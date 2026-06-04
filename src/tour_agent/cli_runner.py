"""CLI/구독(Agent SDK) 기반 러너 — 로컬·개발용.

ApiAgentRunner와 **같은 ToolSpec·system 프롬프트를 공유**하고, 실행 엔진만 SDK로 바꾼다
(ToolSpec -> SDK in-process 툴 변환). 그래야 두 경로의 동작 분기를 최소화한다.

claude_agent_sdk는 지연 임포트(seam) — 이 모듈은 SDK 없이도 import된다. 실제 실행에는
SDK·CLI(구독 로그인)가 필요하다. 약관상 외부 출시는 API 경로를 써야 한다.
"""

from __future__ import annotations

from .api_runner import ToolSpec


class CliAgentRunner:
    def __init__(self, tools: list[ToolSpec], system: str, *, model: str | None = None):
        self._tools = tools
        self._system = system
        self._model = model
        self._session = None

    async def _ensure_session(self):
        if self._session is None:
            from claude_agent_sdk import (
                ClaudeAgentOptions,
                ClaudeSDKClient,
                create_sdk_mcp_server,
                tool,
            )

            sdk_tools = []
            for spec in self._tools:

                def make(spec: ToolSpec):
                    @tool(spec.name, spec.description, spec.input_schema)
                    async def _t(args: dict) -> dict:
                        return {
                            "content": [
                                {"type": "text", "text": await spec.handler(args)}
                            ]
                        }

                    return _t

                sdk_tools.append(make(spec))

            kwargs = dict(system_prompt=self._system)
            if sdk_tools:
                kwargs["mcp_servers"] = {
                    "tools": create_sdk_mcp_server("tools", "1.0.0", tools=sdk_tools)
                }
                kwargs["allowed_tools"] = [
                    f"mcp__tools__{s.name}" for s in self._tools
                ]
            if self._model:
                kwargs["model"] = self._model

            self._session = ClaudeSDKClient(options=ClaudeAgentOptions(**kwargs))
            await self._session.__aenter__()
        return self._session

    async def run_turn(self, prompt: str) -> str:
        session = await self._ensure_session()
        await session.query(prompt)
        result = ""
        async for message in session.receive_response():
            if hasattr(message, "result") and message.result:
                result = message.result
        return result

    async def aclose(self) -> None:
        if self._session is not None:
            await self._session.__aexit__(None, None, None)
            self._session = None
