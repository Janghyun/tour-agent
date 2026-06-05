"""실행 진입점 — 방별 그룹챗 코어를 실제 AgentSession에 연결해 서빙한다.

    python -m tour_agent.main                       # 기본 0.0.0.0:8000, BACKEND=api
    BACKEND=api ANTHROPIC_API_KEY=... python -m tour_agent.main
    BACKEND=cli python -m tour_agent.main           # 로컬·개발: 구독으로 봇 구동(키 불필요)

약관(중요): 외부 출시 빌드는 반드시 BACKEND=api. CLI(구독)는 개인·사내 도구로만.
"""

from __future__ import annotations

import os

# .env가 있으면 환경변수로 로드(이미 설정된 환경변수는 덮어쓰지 않음).
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from .app import create_app
from .factory import build_default_runner
from .kakao import KakaoClient, KakaoError
from .messages import InMemoryMessageStore
from .state import InMemoryStateStore, SupabaseStateStore
from .supabase_store import SupabaseError, SupabaseMessageStore, SupabaseRowStore

# 실행 경로: 기본 api(외부 출시), 로컬·개발은 BACKEND=cli(구독)로 키 없이 봇 구동.
_backend = os.environ.get("BACKEND", "api").lower()

# CLI(구독) 모드는 claude 구독 로그인으로 인증한다. ANTHROPIC_API_KEY가 환경에 있으면
# Agent SDK가 그 키로 API 인증을 시도하므로(키가 틀리면 'Invalid API key'), cli 모드에선 제거한다.
if _backend == "cli":
    os.environ.pop("ANTHROPIC_API_KEY", None)

# 진실의 원천(앱 상태 + 채팅 메시지). SUPABASE 키 + 연결 가능하면 영속, 아니면 인메모리 fallback.
def _make_stores():
    try:
        rows = SupabaseRowStore.from_env()
    except SupabaseError:
        print("[store] 인메모리 사용(SUPABASE 키 없음)")
        return InMemoryStateStore(), InMemoryMessageStore(), InMemoryMessageStore()
    import asyncio

    try:  # 테이블·권한 헬스체크 — 실패하면 인메모리로 안전하게 내려간다.
        asyncio.run(rows.get("__healthcheck__"))
    except Exception as exc:  # noqa: BLE001 - 어떤 연결 오류든 fallback
        print(f"[store] Supabase 연결 실패 → 인메모리 fallback: {str(exc)[:140]}")
        return InMemoryStateStore(), InMemoryMessageStore(), InMemoryMessageStore()
    print("[store] Supabase 영속 사용(방 상태 + 채팅 + 내보낸 기록)")
    url, key = os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"]
    return (
        SupabaseStateStore(rows),
        SupabaseMessageStore(url, key),
        SupabaseMessageStore(url, key, table="room_export"),
    )


_store, _message_store, _export_store = _make_stores()

# Kakao 키가 있으면 검색·동선 툴을 붙이고, 없으면 order_route(순수)만.
try:
    _kakao = KakaoClient.from_env()
except KakaoError:
    _kakao = None

# 종합 검색 소스 — 키가 있는 것만 묶는다(Kakao + 네이버 + 구글). place_finder는 종합 결과.
from .google_places import GooglePlacesClient, GooglePlacesError  # noqa: E402
from .naver import NaverClient, NaverError  # noqa: E402
from .search_aggregate import make_place_finder  # noqa: E402

_sources = []
if _kakao is not None:
    _sources.append(_kakao)
try:
    _sources.append(NaverClient.from_env())
    print("[검색] 네이버 소스 추가")
except NaverError:
    pass
try:
    _sources.append(GooglePlacesClient.from_env())
    print("[검색] 구글 소스 추가")
except GooglePlacesError:
    pass
_agg_finder = make_place_finder(_sources) if _sources else None
print(f"[검색] 종합 소스 {len(_sources)}개")

# 방마다: 그룹챗 코어 -> 라우팅 게이트(단순/작업 + 스냅샷 + 예산) -> LLM 러너.
# emit_card는 방의 카드 브로드캐스트 — 작업 경로의 present_* 툴이 이걸로 카드를 내보낸다.
# /후보·링크 등록·일정 좌표 보강에 쓰는 검색기 — 종합 검색(여러 소스). 없으면 비활성.
_place_finder = _agg_finder
# 링크 '후보 등록' 버튼: URL에서 장소명을 뽑아 검색에 넘긴다.
from .link_resolver import resolve_place_name as _url_resolver  # noqa: E402

app = create_app(
    agent_factory=lambda room_id, emit_card: build_default_runner(
        room_id, _store, backend=_backend, emit_card=emit_card, kakao_client=_kakao,
        place_finder=_agg_finder,
    ),
    store=_store,
    place_finder=_place_finder,
    url_resolver=_url_resolver,
    message_store=_message_store,
    export_store=_export_store,
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
