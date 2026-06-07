import asyncio

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


async def test_cli_run_turn_times_out_and_recovers_even_if_close_fails():
    """응답이 안 오면 타임아웃 안내를 돌려주고, 세션 종료가 실패해도 멈추지 않는다."""
    runner = CliAgentRunner(tools=[], system="s", timeout=0.05)

    async def slow(_prompt):
        await asyncio.sleep(5)  # 타임아웃보다 오래 — 절대 끝나지 않게

    async def close_boom():
        raise RuntimeError("close failed")  # 종료가 실패해도 run_turn은 멈추면 안 된다

    runner._run_turn = slow
    runner.aclose = close_boom

    out = await asyncio.wait_for(runner.run_turn("hi"), 2)
    assert "오래 걸려" in out
    assert runner._session is None  # 손상 방지로 세션 참조를 버린다


def test_backend_from_env_defaults_to_api(monkeypatch):
    monkeypatch.delenv("BACKEND", raising=False)
    assert Backend.from_env() is Backend.API


def test_backend_from_env_reads_cli(monkeypatch):
    monkeypatch.setenv("BACKEND", "cli")
    assert Backend.from_env() is Backend.CLI
