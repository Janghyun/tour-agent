# 여행 코스 에이전트 (tour-agent)

여러 여행자가 한 **방**에 모여 **봇**을 명시적으로 호출해 장소를 검색·등록하고,
봇이 **숙소**와 **동선**을 고려해 짜 주는 **일정**을 함께 다듬다가 **방장**이 확정하는
그룹 협업 웹앱.

봇은 **Claude Messages API**(원시 호출)로 동작한다. 로컬·개발에서는 CLI(구독, Agent SDK)
경로도 쓸 수 있고, 외부 출시 빌드는 약관상 항상 API 모드를 쓴다(`runner.py`의 Backend 선택).

## 현황

- 백엔드: 그룹챗 코어·라우팅·툴/카드 계약·상태 쓰기·일정 영속·Supabase 스토어까지 구현. **72개 테스트 통과**.
- 프론트: Vite + React. 디자인 시스템(`styles.css`)에 맞춰 카드·채팅·컴포저 포팅. 빌드 그린 + SSR 렌더 검증.
- 배포: Dockerfile·fly.toml·GitHub Actions(CI + 배포) 스캐폴딩 완료(실제 배포는 자격증명 주입 후).

| 영역 | 내용 |
|---|---|
| 그룹챗 코어 | 명시적 트리거(@봇·슬래시)·발화자 퍼널링·방별 락 직렬화·디바운스·논블로킹+큐 |
| 라우팅 게이트 | 단순/작업 분기·방 상태 스냅샷 주입·방별 일일 예산 캡 |
| 봇 실행 | Messages API 툴-유즈 루프(`api_runner.py`) / 로컬 CLI 경로(`cli_runner.py`) |
| Kakao 툴 | 장소 검색·동선(거리/소요시간) |
| 동선 최적화 | 결정적 NN + 2-opt (`route.py`) — 숙소 출발 방문 순서 |
| 상태·메모리 | 후보 풀·작업 일정·확정 스냅샷·선호 — 앱 상태가 진실의 원천(Supabase seam) |
| 액션 프로토콜 | `{"action":...}`(상태 변경) vs 채팅 `{"speaker","text"}` 분리 처리 |

## 구조

```
src/tour_agent/
  groupchat.py   그룹챗 코어 (트리거·퍼널링·락·디바운스·큐)
  app.py         FastAPI /ws/{room_id} · RoomHub (브로드캐스트·카드·액션)
  routing.py     라우팅 게이트 (분기·스냅샷·예산)
  runner.py      AgentRunner 선택자 (Backend: cli/api)
  api_runner.py  Messages API 러너 (툴-유즈 루프·ToolSpec·분류기)
  cli_runner.py  CLI/구독(Agent SDK) 러너 — 로컬·개발용
  mode.py        실행 모드 선택 (SDK-free)
  prompts.py     시스템 프롬프트 (두 실행 모드 공유)
  kakao.py       Kakao Local·Mobility 래퍼 (+ httpx 전송)
  kakao_tools.py Kakao 기능을 에이전트 툴로 노출
  tools.py       입력 툴 + 결정적 동선 정렬 ToolSpec
  cards.py       present_* 출력 카드 (PlaceOptions/Itinerary/Map)
  route.py       결정적 동선 최적화 (NN + 2-opt)
  itinerary.py   서브에이전트 3종 (설계 / 동선 / 검증) 결정적 뼈대
  state.py       RoomState·StateStore (인메모리 + Supabase seam)
  actions.py     액션 적용 (add/remove/meta/숙소/선호/확정, 방장 검사)
  factory.py     방 단위 파이프라인 합성
  main.py        앱 진입점 (create_app + 기본 러너)
tests/           72 테스트 (16개 파일)
web/             Vite + React 프론트
docs/            TASK / UX / DESIGN_BRIEF / TERMS / checkpoints
CONTEXT.md       도메인 용어집
```

## 백엔드 실행

```bash
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q                              # 72 passed

# 봇·검색을 실제로 쓰려면 키 주입(없으면 검색/봇 기능만 비활성, 그룹챗은 동작)
BACKEND=api ANTHROPIC_API_KEY=... KAKAO_REST_API_KEY=... \
  .venv/bin/python -m tour_agent.main                     # ws://localhost:8000/ws/{room_id}

# 실키 e2e(API 키 없이 로컬 claude 구독으로 실제 봇 검증) — claude CLI 로그인 필요
.venv/bin/pip install claude-agent-sdk
RUN_CLI_E2E=1 .venv/bin/python -m pytest tests/test_cli_e2e.py -s   # 실서버+구독봇+실WS, place_options 카드 종단 확인
```

## 프론트 실행

```bash
cd web && npm install
npm run dev            # http://localhost:5173/?room=jeju&me=민수  (기본 WS: ws://localhost:8000)
npm run build          # 프로덕션 번들 (dist/)
npm run ssr-check      # SSR 렌더 검증 — 브라우저 없이 React 트리 렌더 확인
```

백엔드 주소가 다르면 `VITE_WS_BASE`로 지정: `VITE_WS_BASE=wss://tour-agent.fly.dev npm run build`.

## 배포

- **백엔드 → Fly.io**: 방별 인메모리 세션 때문에 `min_machines_running=1`(스케일 시 room 단위 sticky 필요).
  런타임 키는 레포가 아니라 `fly secrets set ANTHROPIC_API_KEY=... KAKAO_REST_API_KEY=...`로 주입.
- **프론트 → Cloudflare Pages**: `web/dist` 정적 배포. 빌드 시 `VITE_WS_BASE`를 백엔드 주소로.
- **GitHub Actions**:
  - `ci.yml` — 푸시·PR마다 백엔드 테스트 + 프론트 빌드 + SSR 검증.
  - `deploy.yml` — main 푸시·수동 실행. 각 잡은 해당 시크릿이 있을 때만 동작(없으면 건너뜀).
    필요한 시크릿: `FLY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; 변수 `VITE_WS_BASE`(선택 `CF_PAGES_PROJECT`).

```bash
# 수동 배포(자격증명 보유 시)
flyctl deploy                                              # 백엔드
cd web && VITE_WS_BASE=wss://tour-agent.fly.dev npm run build
npx wrangler pages deploy dist --project-name tour-agent-web   # 프론트
```

## 제약

- **약관**: 외부 출시 빌드는 반드시 `BACKEND=api`. CLI(구독)는 개인·사내 도구로만.
- **보안**: bash·파일편집 등 위험 툴 노출 금지(화이트리스트). 키는 절대 커밋하지 않음(`.env`는 gitignore, `.env.example`만 추적).
- 외부 의존(Anthropic·Kakao·Supabase)은 인터페이스(seam)로 격리 — 키 없이도 72개 테스트가 돈다.
