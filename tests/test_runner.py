from tour_agent.api_runner import ApiAgentRunner
from tour_agent.cli_runner import CliAgentRunner
from tour_agent.mode import Backend
from tour_agent.runner import build_agent_runner


async def test_api_backend_builds_api_runner_and_runs():
    async def model(messages, tools, system):
        return {"stop_reason": "end_turn", "content": [{"type": "text", "text": "ok"}]}

    runner = build_agent_runner(Backend.API, tools=[], system="s", model_client=model)

    assert isinstance(runner, ApiAgentRunner)
    assert await runner.run_turn("hi") == "ok"


def test_cli_backend_builds_cli_runner_without_invoking_sdk():
    # 생성만 — SDK는 run_turn 시점에만 필요(지연 임포트).
    runner = build_agent_runner(Backend.CLI, tools=[], system="s")
    assert isinstance(runner, CliAgentRunner)


def test_backend_from_env_defaults_to_api(monkeypatch):
    monkeypatch.delenv("BACKEND", raising=False)
    assert Backend.from_env() is Backend.API


def test_backend_from_env_reads_cli(monkeypatch):
    monkeypatch.setenv("BACKEND", "cli")
    assert Backend.from_env() is Backend.CLI
