"""풀스택 실키(구독) e2e — 실제 uvicorn 서버 + 실제 CLI 봇(구독) + 실제 WS 클라이언트.

봇 경로를 진짜 모델로 종단 검증한다(API 키 불필요, 로컬 `claude` 구독 사용).
기본 테스트런·CI에서는 건너뛴다. 켜려면:

    RUN_CLI_E2E=1 .venv/bin/python -m pytest tests/test_cli_e2e.py -s

전제: `claude` CLI 로그인 + `claude_agent_sdk` 설치. 둘 중 하나라도 없으면 skip.
"""

import asyncio
import importlib.util
import json
import os
import shutil

import pytest
import websockets

from tour_agent.app import create_app
from tour_agent.factory import build_room_runner
from tour_agent.state import InMemoryStateStore

from test_app import _ServerThread

_HAS_SDK = importlib.util.find_spec("claude_agent_sdk") is not None
_HAS_CLI = shutil.which("claude") is not None

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_CLI_E2E") != "1" or not _HAS_SDK or not _HAS_CLI,
    reason="CLI 구독 e2e는 RUN_CLI_E2E=1 + claude CLI/SDK 필요(기본·CI에서 skip)",
)


class _AlwaysTask:
    """e2e용 분류기 — 항상 작업 경로로 보낸다(실제 분류기 호출 없이 봇·툴 경로 검증)."""

    async def classify(self, prompt: str) -> str:
        return "task"


async def test_fullstack_cli_bot_emits_place_options_card_over_ws():
    from tour_agent.cli_runner import CliAgentRunner
    from tour_agent.cards import present_tools
    from tour_agent.prompts import ORCHESTRATOR_SYSTEM, SIMPLE_SYSTEM

    store = InMemoryStateStore()

    def factory(room_id, emit_card):
        task_runner = CliAgentRunner(present_tools(emit_card), ORCHESTRATOR_SYSTEM)
        simple_runner = CliAgentRunner([], SIMPLE_SYSTEM)
        return build_room_runner(
            room_id,
            store,
            classifier=_AlwaysTask(),
            simple_runner=simple_runner,
            task_runner=task_runner,
        )

    app = create_app(agent_factory=factory, store=store, debounce_seconds=0.05)

    async with _ServerThread(app) as port:
        uri = f"ws://127.0.0.1:{port}/ws/jeju"
        async with websockets.connect(uri) as ws:
            await ws.send(
                json.dumps(
                    {
                        "speaker": "민수",
                        "text": (
                            "@봇 제주 서귀포 유명 맛집 3곳을 장소 옵션 카드로 보여줘. "
                            "검색 도구는 없으니 네가 아는 곳으로 채워 present_place_options 를 호출해."
                        ),
                    }
                )
            )
            card = None
            # 사람 에코 + 봇 텍스트/카드가 섞여 온다. place_options 카드가 올 때까지 드레인.
            for _ in range(12):
                try:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 90))
                except asyncio.TimeoutError:
                    break
                if m.get("type") == "card" and m.get("card", {}).get("type") == "place_options":
                    card = m["card"]
                    break

    assert card is not None, "place_options 카드를 WS로 받지 못함"
    assert card.get("options"), "카드에 옵션이 비어 있음"
