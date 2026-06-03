"""
agent_backend.py
================
Claude Agent SDK를 CLI(구독) / API(키) 두 경로로 모두 지원하는 백엔드 추상화.

핵심 아이디어
------------
에이전트 "로직"(시스템 프롬프트, 허용 툴, 서브에이전트, MCP)은 한 곳에서 정의하고,
"실행 경로"(인증/과금)만 환경변수 BACKEND 로 갈아끼운다.

    BACKEND=api  →  ANTHROPIC_API_KEY 로 인증, 과금은 Anthropic Console (제품/서버 배포 정석)
    BACKEND=cli  →  로컬에 인증된 `claude` 바이너리 사용 (키 없이 구독 자격)

⚠️  약관 주의
    Anthropic은 "제3자 제품"이 claude.ai 구독/로그인으로 인증하는 것을 금지한다.
    따라서 CLI(구독) 경로는 *개인 개발 / 사내 내부 도구* 용으로만 쓰고,
    외부에 출시하는 서비스는 반드시 API 키 경로를 써야 한다.
    (2026-06-15부터 구독 플랜의 Agent SDK 사용량은 별도 월 크레딧으로 분리됨.)

요구사항
    pip install claude-agent-sdk   # CLI는 패키지에 번들됨(v0.1.8+)
    Python 3.10+
"""

from __future__ import annotations

import os
import shutil
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    query,
)


class Backend(str, Enum):
    """실행 경로 선택."""
    API = "api"   # ANTHROPIC_API_KEY 인증 (제품 배포용)
    CLI = "cli"   # 로컬 claude 바이너리 / 구독 (개인·사내 도구용)

    @classmethod
    def from_env(cls, default: "Backend" = None) -> "Backend":
        raw = os.environ.get("BACKEND", (default or cls.API).value).strip().lower()
        try:
            return cls(raw)
        except ValueError:
            raise ValueError(
                f"BACKEND 값이 잘못됐습니다: {raw!r}. 'api' 또는 'cli' 중 하나여야 합니다."
            )


@dataclass
class AgentConfig:
    """에이전트 '로직' — 실행 경로와 무관한 부분. 한 번만 정의해서 두 경로가 공유한다."""
    system_prompt: str = "당신은 여행 코스를 설계하고 질문에 답하는 도우미입니다."
    # 여행 봇에는 bash·파일 편집 툴이 위험하므로, 필요한 것만 화이트리스트로 노출.
    allowed_tools: list[str] = field(default_factory=lambda: ["WebSearch"])
    model: str | None = None          # 예: "claude-sonnet-4-6" / None이면 SDK 기본값
    max_turns: int | None = None      # 에이전트 루프 상한 (비용 방어)
    mcp_servers: dict = field(default_factory=dict)  # 커스텀 MCP 툴(Kakao 등)


def _validate_backend(backend: Backend) -> None:
    """선택한 경로가 실제로 쓸 수 있는 상태인지 사전 점검 → 런타임 실패를 앞당김."""
    if backend is Backend.API:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError(
                "BACKEND=api 인데 ANTHROPIC_API_KEY가 없습니다. "
                "키를 설정하거나 BACKEND=cli 로 전환하세요."
            )
    elif backend is Backend.CLI:
        # 커스텀 경로 우선, 없으면 PATH 에서 탐색. (SDK가 번들 CLI를 가질 수도 있으나
        # 명시적으로 점검해 두면 'CLINotFoundError'를 친절한 메시지로 바꿔준다.)
        cli_path = os.environ.get("CLAUDE_CLI_PATH")
        if cli_path and not os.path.exists(cli_path):
            raise RuntimeError(f"CLAUDE_CLI_PATH가 가리키는 파일이 없습니다: {cli_path}")
        if not cli_path and shutil.which("claude") is None:
            # 번들 CLI가 있을 수 있으니 치명적 오류 대신 경고만.
            print(
                "[warn] PATH에서 `claude`를 못 찾았습니다. SDK 번들 CLI를 시도합니다. "
                "실패하면 `npm i -g @anthropic-ai/claude-code` 또는 "
                "CLAUDE_CLI_PATH 설정이 필요합니다."
            )


def build_options(cfg: AgentConfig, backend: Backend) -> ClaudeAgentOptions:
    """
    AgentConfig(로직) + Backend(실행 경로) → ClaudeAgentOptions.
    두 경로의 차이는 여기 한 곳에 격리된다.
    """
    _validate_backend(backend)

    kwargs: dict = dict(
        system_prompt=cfg.system_prompt,
        allowed_tools=cfg.allowed_tools,
    )
    if cfg.model:
        kwargs["model"] = cfg.model
    if cfg.max_turns is not None:
        kwargs["max_turns"] = cfg.max_turns
    if cfg.mcp_servers:
        kwargs["mcp_servers"] = cfg.mcp_servers

    if backend is Backend.CLI:
        # 로컬/특정 빌드 CLI를 쓰고 싶을 때만 cli_path 지정.
        # (미지정 시 SDK가 번들 CLI 또는 ~/.claude/local/claude 등을 사용)
        cli_path = os.environ.get("CLAUDE_CLI_PATH")
        if cli_path:
            kwargs["cli_path"] = cli_path
    # backend is API 인 경우 별도 옵션 불필요 — SDK가 ANTHROPIC_API_KEY를 자동 사용.

    return ClaudeAgentOptions(**kwargs)


# ── 두 가지 사용 패턴 ─────────────────────────────────────────────

async def run_once(prompt: str, cfg: AgentConfig, backend: Backend | None = None) -> str:
    """
    단발 질의 — query() 사용. "오늘 날씨?" 같은 1회성 응답에 적합.
    경로(api/cli)와 무관하게 동일하게 동작한다.
    """
    backend = backend or Backend.from_env()
    options = build_options(cfg, backend)

    result_text = ""
    async for message in query(prompt=prompt, options=options):
        # 최종 결과 메시지에는 result 속성이 붙는다.
        if hasattr(message, "result") and message.result:
            result_text = message.result
    return result_text


class AgentSession:
    """
    멀티턴 세션 — ClaudeSDKClient 사용. 단톡방처럼 맥락이 이어지는 대화에 적합.
    방(room)마다 하나씩 만들어 두고, 위에서 설계한 '방별 세션 락'으로 직렬화한다.
    """

    def __init__(self, cfg: AgentConfig, backend: Backend | None = None):
        self.backend = backend or Backend.from_env()
        self.options = build_options(cfg, self.backend)
        self._client: ClaudeSDKClient | None = None

    async def __aenter__(self) -> "AgentSession":
        self._client = ClaudeSDKClient(options=self.options)
        await self._client.__aenter__()
        return self

    async def __aexit__(self, *exc) -> None:
        if self._client:
            await self._client.__aexit__(*exc)
            self._client = None

    async def ask(self, prompt: str) -> AsyncIterator:
        """한 턴을 보내고 응답 메시지를 스트리밍으로 받는다."""
        if not self._client:
            raise RuntimeError("세션이 열려있지 않습니다. `async with AgentSession(...)` 로 사용하세요.")
        await self._client.query(prompt)
        async for message in self._client.receive_response():
            yield message


# ── 데모 ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import asyncio

    cfg = AgentConfig(
        system_prompt="당신은 제주 여행 코스를 설계하는 도우미입니다. 간결하고 결정적으로 답하세요.",
        allowed_tools=["WebSearch"],
        max_turns=6,
    )

    async def demo():
        backend = Backend.from_env(default=Backend.API)
        print(f"[backend] {backend.value} 경로로 실행합니다.")

        # 1) 단발
        answer = await run_once("제주 함덕해수욕장 근처 점심 한 곳만 추천해줘.", cfg, backend)
        print("\n[단발 응답]\n", answer)

        # 2) 멀티턴
        async with AgentSession(cfg, backend) as session:
            async for msg in session.ask("3박4일 가족 코스 첫째 날만 짧게 잡아줘."):
                if hasattr(msg, "result") and msg.result:
                    print("\n[멀티턴 응답]\n", msg.result)

    asyncio.run(demo())
