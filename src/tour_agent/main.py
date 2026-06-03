"""실행 진입점 — 방별 그룹챗 코어를 실제 AgentSession에 연결해 서빙한다.

    python -m tour_agent.main          # 기본 0.0.0.0:8000
    BACKEND=api ANTHROPIC_API_KEY=... python -m tour_agent.main

약관(중요): 외부 출시 빌드는 반드시 BACKEND=api. CLI(구독)는 개인·사내 도구로만.
"""

from __future__ import annotations

import os

from .app import create_app
from .factory import build_default_runner
from .state import InMemoryStateStore

# 진실의 원천(앱 상태). 개발 기본은 인메모리, 프로덕션은 SupabaseStateStore로 교체.
_store = InMemoryStateStore()

# 방마다: 그룹챗 코어 -> 라우팅 게이트(단순/작업 + 스냅샷 + 예산) -> LLM 러너.
app = create_app(agent_factory=lambda room_id: build_default_runner(room_id, _store))


def run() -> None:
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
    )


if __name__ == "__main__":
    run()
