"""실행 진입점 — 방별 그룹챗 코어를 실제 AgentSession에 연결해 서빙한다.

    python -m tour_agent.main          # 기본 0.0.0.0:8000
    BACKEND=api ANTHROPIC_API_KEY=... python -m tour_agent.main

약관(중요): 외부 출시 빌드는 반드시 BACKEND=api. CLI(구독)는 개인·사내 도구로만.
"""

from __future__ import annotations

import os

from .app import create_app
from .factory import build_default_runner
from .kakao import KakaoClient, KakaoError
from .state import InMemoryStateStore

# 진실의 원천(앱 상태). 개발 기본은 인메모리, 프로덕션은 SupabaseStateStore로 교체.
_store = InMemoryStateStore()

# Kakao 키가 있으면 검색·동선 툴을 붙이고, 없으면 order_route(순수)만.
try:
    _kakao = KakaoClient.from_env()
except KakaoError:
    _kakao = None

# 방마다: 그룹챗 코어 -> 라우팅 게이트(단순/작업 + 스냅샷 + 예산) -> LLM 러너.
# emit_card는 방의 카드 브로드캐스트 — 작업 경로의 present_* 툴이 이걸로 카드를 내보낸다.
app = create_app(
    agent_factory=lambda room_id, emit_card: build_default_runner(
        room_id, _store, emit_card=emit_card, kakao_client=_kakao
    ),
    store=_store,
)


def run() -> None:
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
    )


if __name__ == "__main__":
    run()
