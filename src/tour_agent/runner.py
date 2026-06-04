"""AgentRunner 선택자 — Backend(cli/api) 옵션에 따라 세부 구현을 고른다.

같은 ``AgentRunner`` 인터페이스(run_turn(prompt)->str) 뒤에서:
  API -> ApiAgentRunner (Messages API, 권위 있는 구현)
  CLI -> CliAgentRunner (Agent SDK/구독, 로컬·개발용)

두 구현은 같은 ToolSpec·system을 받는다.
"""

from __future__ import annotations

from .api_runner import ApiAgentRunner, ToolSpec, anthropic_model_client
from .mode import Backend


def build_agent_runner(
    backend: Backend,
    *,
    tools: list[ToolSpec],
    system: str,
    model: str = "claude-sonnet-4-6",
    model_client=None,
):
    if backend is Backend.API:
        return ApiAgentRunner(
            model_client or anthropic_model_client(model), tools, system
        )
    # CLI는 SDK 지연 임포트 — 여기서만 불러온다.
    from .cli_runner import CliAgentRunner

    return CliAgentRunner(tools, system, model=model)
