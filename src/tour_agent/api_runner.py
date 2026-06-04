"""Anthropic Messages API 기반 에이전트 러너(SDK 없음).

서버리스/프로덕션의 *권위 있는* 구현. 서브프로세스가 없어 어디서든(Workers·Lambda·컨테이너)
돈다. 모델 호출은 ``model_client`` 로 주입해 페이크로 결정적 테스트한다.

루프: 모델 호출 -> tool_use면 도구 실행 후 tool_result 되먹임 -> 반복 -> 최종 텍스트 반환.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

# model_client(messages, tool_defs, system) -> {"stop_reason": str, "content": [block, ...]}
ModelClient = Callable[[list, list, str], Awaitable[dict]]
ToolHandler = Callable[[dict], Awaitable[str]]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_schema: dict
    handler: ToolHandler


class ApiAgentRunner:
    def __init__(
        self,
        model_client: ModelClient,
        tools: list[ToolSpec],
        system: str,
        *,
        max_steps: int = 8,
    ):
        self._model = model_client
        self._tools = {t.name: t for t in tools}
        self._tool_defs = [
            {"name": t.name, "description": t.description, "input_schema": t.input_schema}
            for t in tools
        ]
        self._system = system
        self._max_steps = max_steps

    async def run_turn(self, prompt: str) -> str:
        messages: list[dict] = [{"role": "user", "content": prompt}]
        for _ in range(self._max_steps):
            resp = await self._model(messages, self._tool_defs, self._system)
            content = resp.get("content", [])
            if resp.get("stop_reason") == "tool_use":
                messages.append({"role": "assistant", "content": content})
                results = []
                for block in content:
                    if block.get("type") == "tool_use":
                        output = await self._run_tool(
                            block.get("name", ""), block.get("input", {})
                        )
                        results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.get("id"),
                                "content": output,
                            }
                        )
                messages.append({"role": "user", "content": results})
                continue
            return _text_of(content)
        return "(요청이 너무 복잡해 여기서 멈췄어요. 조금 더 좁혀서 다시 물어봐 주세요.)"

    async def _run_tool(self, name: str, args: dict) -> str:
        tool = self._tools.get(name)
        if tool is None:
            return f"[오류] 알 수 없는 도구: {name}"
        try:
            return await tool.handler(args)
        except Exception as exc:  # 도구 실패가 루프를 죽이지 않도록 되먹임
            return f"[도구 오류] {name}: {exc}"


def _text_of(content: list) -> str:
    return "".join(b.get("text", "") for b in content if b.get("type") == "text")


DEFAULT_CLASSIFIER_SYSTEM = (
    "너는 여행 그룹챗 봇의 라우터다. 사용자 메시지가 단순 질의인지 작업 요청인지 분류해라. "
    "일정 설계·장소 검색·동선 검증처럼 도구나 여러 단계가 필요하면 'task', "
    "한두 문장으로 답할 잡담·단순 질의면 'simple'. 오직 'simple' 또는 'task' 한 단어만 출력해라."
)


class ApiClassifier:
    """Messages API 단발 호출로 단순/작업을 분류한다(SDK 없음). routing.Classifier 구현."""

    def __init__(self, model_client: ModelClient, *, system: str = DEFAULT_CLASSIFIER_SYSTEM):
        self._model = model_client
        self._system = system

    async def classify(self, prompt: str) -> str:
        resp = await self._model([{"role": "user", "content": prompt}], [], self._system)
        text = _text_of(resp.get("content", [])).strip().lower()
        return "task" if "task" in text else "simple"


def anthropic_model_client(
    model: str = "claude-sonnet-4-6", *, max_tokens: int = 2048
) -> ModelClient:
    """실제 Anthropic Messages API 호출 어댑터(지연 임포트 seam). API 키 필요."""

    async def call(messages: list, tool_defs: list, system: str) -> dict:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic()
        resp = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            tools=tool_defs,
            messages=messages,
        )
        return {
            "stop_reason": resp.stop_reason,
            "content": [block.model_dump() for block in resp.content],
        }

    return call
