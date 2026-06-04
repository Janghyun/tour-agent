# 여행 코스 에이전트 서비스 — Claude Code 작업 명세

> 목적: 여행자들이 모인 방에서 일정 추천·동선 검증·Q&A를 해주는 에이전트 서비스.
> Python 백엔드. 두 실행 모드: API(Messages API 직접, 서버리스·권위 구현) / CLI(Agent SDK·구독, 로컬).
> 이 문서만 읽고 새 세션에서 작업을 시작할 수 있도록 작성됨.

---

## 1. 한 줄 요약

여러 여행자가 모인 채팅방에 에이전트를 붙여, "3박4일 코스 짜줘" 같은 작업은 풀 에이전트 루프로,
"오늘 날씨 어때?" 같은 단순 질의는 저렴한 단발 호출로 처리하는 멀티턴 그룹챗 서비스.

---

## 2. 확정된 기술 결정 (재논의 불필요)

| 영역 | 결정 | 비고 |
|---|---|---|
| 에이전트 | Claude Agent SDK (Python) | `query()` 단발 + `ClaudeSDKClient` 멀티턴 |
| 실행 경로 | CLI / API 토글 | `BACKEND` 환경변수로 전환. 아래 3절 코드 참고 |
| 백엔드 | FastAPI | 방별 WebSocket 허브 + 방별 세션·락 |
| 지도·장소 | Kakao Local · Mobility | 국내 데이터/길찾기. in-process 툴로 노출. **영업시간은 Kakao 미제공 → WebSearch 교차 확인** |
| 상태·메모리 | Supabase(Postgres), **구조화 테이블** | **진실의 원천**(SDK 세션은 휘발성 캐시). 방 선호·확정 일정 저장. **pgvector·임베딩은 v1 보류** |
| 프론트 | React/Next + Kakao Map JS | 에이전트가 **UI 툴(`present_*`) 호출** → 백엔드가 카드 페이로드로 전달(일정·옵션·지도) |
| 모델 라우팅 | **균형 티어** | 게이트·치프·동선·검증=Haiku, 일정 설계=Sonnet, **Opus 보류** |

---

## 2.5 그릴링 갱신 (2026-06-03)

`/grill-with-docs` 세션으로 확정·수정된 결정. 도메인 용어 정의는 루트 `CONTEXT.md` 참조.

- **채팅 표면 = 자체 웹앱 방.** 외부 메신저(카카오톡) 단톡방 연동 아님 — 카드 UI 제어·네트워크효과 트레이드오프 끝에 자체 웹앱 선택.
- **배포 = 폐쇄 베타(API 소수 초대), `BACKEND=api`.** 약관상 외부 출시는 API 필수. 과금/정식 쿼터는 외부 공개 시점으로 미룸.
- **LLM 실행 = Messages API 직접(권위 구현, `ApiAgentRunner`) + cli/api 실행 모드 토글.** (2026-06-04 갱신) 공식 Claude Agent SDK는 로컬/구독(CLI) 경로에서만(`CliAgentRunner`). Messages API 경로는 서브프로세스가 없어 서버리스(Workers/Fly)에 자유롭게 배포된다. → 2절 표의 "Agent SDK" 항목은 이 결정으로 대체됨.
- **응답 트리거 = 명시적 호출만**(@봇 멘션 + 슬래시 커맨드). "질문 감지" 자동 트리거 폐기 — 다자간 방 오발동·매-메시지 분류 비용 회피. 게이트 A(응답 여부, 결정적·무료)와 게이트 B(단순/작업 라우팅, 호출된 메시지에만)를 분리.
- **영속화 = 앱 상태(Supabase)가 진실의 원천.** SDK 세션은 휘발성 캐시. 재시작·방 재오픈 시 새 세션에 상태 스냅샷+방 요약 주입으로 재구성(SDK session resume에 의존하지 않음 → 멀티 인스턴스·비용 상한 안전).
- **선호 저장 = 구조화 테이블만.** pgvector·그룹 선호 임베딩은 v1 보류(데이터 규모 작아 직접 주입으로 충분).
- **의사결정 = 방장 단독 확정.** 투표는 v1 보류. 선호는 개인 단위 취향 신호로 별도.
- **일정 데이터 모델 = 방당 단일 "작업 중 일정" + 확정 스냅샷.** 경쟁하는 명명된 대안(A/B/C) 두지 않음.
- **동선 = 결정적 알고리즘(Kakao Mobility 소요시간 → NN+2-opt 등) + LLM 후처리(영업시간·식사시간·선호 등 소프트 제약).** LLM이 방문 순서를 직접 발명하지 않음(TSP 약점 회피).
- **동시성 = 논블로킹 + 큐.** 방별 락은 SDK 세션 직렬화용. 긴 작업 중 사람은 자유 대화, 봇은 "작업 중" 표시, 들어온 @봇 요청은 큐잉.

---

## 3. LLM 실행 계층 (SDK seam 정리 완료, 2026-06-04)

옛 골격 `agent_backend.py`는 **은퇴(삭제)** 했다. 실행 계층은 다음으로 일원화됨:
- `mode.Backend` — 실행 모드(api/cli)
- `api_runner.ApiAgentRunner` / `ApiClassifier` — **Messages API 직접**(권위 구현, SDK 없음)
- `cli_runner.CliAgentRunner` — Agent SDK/구독(로컬, 유일하게 남은 SDK seam)
- `runner.build_agent_runner(Backend, ...)` — 모드별 분기. 두 구현은 `ToolSpec`·system 프롬프트를 공유.

아래 옛 `Backend`/`AgentConfig`/`run_once`/`AgentSession` 설명은 **역사적 참고용**(코드는 제거됨).

핵심 API:
- `Backend` enum — `API`(키 인증, 제품용) / `CLI`(로컬 claude 바이너리, 구독). `Backend.from_env()`로 `BACKEND` 환경변수 읽음.
- `AgentConfig` — 시스템 프롬프트, `allowed_tools`, model, `max_turns`, `mcp_servers`. 실행 경로와 무관한 "로직".
- `build_options(cfg, backend)` — 두 경로의 차이를 격리하는 단일 지점. `ClaudeAgentOptions` 생성.
- `run_once(prompt, cfg, backend)` — `query()` 기반 단발 질의.
- `AgentSession(cfg, backend)` — `ClaudeSDKClient` 기반 멀티턴. `async with`로 사용, `.ask(prompt)`가 응답 스트리밍.

```python
# 사용 예
cfg = AgentConfig(system_prompt="...", allowed_tools=["WebSearch"], max_turns=6)
async with AgentSession(cfg, Backend.from_env()) as session:
    async for msg in session.ask("3박4일 코스 첫째 날 짜줘"):
        if hasattr(msg, "result") and msg.result:
            print(msg.result)
```

환경변수:
- `BACKEND=api|cli` (기본 api)
- `ANTHROPIC_API_KEY` (api 모드 필수)
- `CLAUDE_CLI_PATH` (cli 모드, 특정 바이너리 지정 시 선택)

---

## 4. 작업 단위 (이 순서로 진행)

### Task 1. 그룹챗 코어 — 메시지 퍼널링 + 방별 세션 락
- FastAPI `/ws/{room_id}` WebSocket 엔드포인트.
- 방(room)별로 `AgentSession` 1개 유지. 방 단위 `asyncio.Lock`으로 query 직렬화.
  (동시 query는 SDK 세션 컨텍스트를 깨뜨림 — 반드시 큐잉/락.)
- 발화자 태그 퍼널링: 들어온 메시지를 `[민수] 우도 갈까?` 형태로 user 턴에 합침. (봇 호출 시 최근 대화 맥락 주입용)
- 응답 트리거: **명시적 호출만** — `@봇` 멘션 또는 슬래시 커맨드(`/추천`, `/일정`). 질문 자동 감지는 하지 않음(게이트 A는 결정적·무료).
- 디바운스: 연속 **@봇 호출**을 1~2초 묶어 한 번에 처리.
- **논블로킹 + 큐**: 긴 작업 중에도 사람은 자유 대화. 봇은 "작업 중" 표시, 그 사이 들어온 @봇 요청은 큐잉(앞 작업 후 처리).
- 방별 `AgentSession`은 **휘발성 캐시**다(진실의 원천은 Supabase 앱 상태 — Task 5). 재시작 시 상태 스냅샷으로 재구성.
- **완료 기준**: 두 명 이상이 같은 방에서 떠들어도 세션이 안 깨지고, **명시적 호출 시에만** 응답.

### Task 2. 응답 라우팅 게이트 (2단 처리) — 게이트 B
- (게이트 A를 통과한, 즉 **명시적으로 호출된** 메시지에만 적용한다.)
- 들어온 트리거 메시지를 Haiku 단발 호출로 "단순 질의 / 작업 요청" 분류.
- 단순 질의 → `run_once()`. **단, 방 상태 스냅샷(목적지·날짜·확정 일정 핵심)을 프롬프트에 항상 주입**해 맥락 있는 답을 내고, 상태로도 모호할 때만 되물음. (스냅샷은 세션 재개용 방 요약 재활용 — 비용 거의 0. 맥락 없는 답은 다자간 여행 방에서 대체로 틀림)
- 작업 요청 → `AgentSession` 풀 루프(서브에이전트 위임 — Task 4).
- 방별 일일 토큰/비용 예산 캡 추가.
- **완료 기준**: "내일 비 와?"는 방 맥락(제주·날짜)을 반영한 단발로, "일정 짜줘"는 풀 루프로 분기.

### Task 3. Kakao 툴 (장소·동선·검증)
- Kakao Local(키워드 장소검색) + Mobility(길찾기/소요시간) 래핑.
- in-process MCP 툴 또는 `AgentConfig.mcp_servers`로 노출.
- `allowed_tools`에 추가. **bash·파일편집 등 기본 위험 툴은 절대 노출 금지** (화이트리스트 유지).
- 장소 검색 결과는 카드 옵션(`present_place_options` — Task 6)으로 띄우고, 사용자가 "추가"한 것만 **후보 장소** 풀에 등록(봇이 임의 추가하지 않음).
- 검증 항목: 영업시간/휴무일/예약 필요 여부. **단, Kakao Local은 영업시간을 반환하지 않음 → `WebSearch`로 교차 확인**하고 단정 대신 "확인 필요" 톤으로 답함.
- **완료 기준**: "성산 근처 점심" 질의에 Kakao 좌표·동선을 붙이고, 영업시간은 WebSearch로 확인해 "확인 필요" 단서와 함께 답함.

### Task 4. 서브에이전트 3종
- `일정 설계` / `동선 최적화` / `검증`. 격리 컨텍스트로 메인 세션 오염 방지. 순차 파이프라인.
- **동선 최적화는 LLM이 방문 순서를 발명하지 않는다**: Kakao Mobility 구간 소요시간 → 결정적 순서화(NN+2-opt 등) → LLM은 영업시간·식사시간·선호 같은 소프트 제약만 적용.
- `검증`은 `WebSearch`로 영업시간/휴무/예약을 교차 확인(격리 컨텍스트).
- 오케스트레이터가 위임. (참고: 기존 Bull/Bear/Judge 패턴과 동형 구조)
- **완료 기준**: 일정 1건 생성 시 세 서브에이전트가 분업해 결과 종합.

### Task 5. 상태·메모리 (Supabase, 구조화 테이블 — 진실의 원천)
- **앱 상태(Supabase)가 진실의 원천**이고 SDK 세션은 휘발성 캐시. "세션 영속화"는 raw 대화 직렬화가 아니라 **상태 + 방 요약으로 재구성**하는 것이다(SDK session resume 미사용).
- 저장: 후보 장소 풀 / **단일 작업 일정 + 확정 스냅샷**(방장 확정 시점) / 선호.
- **선호는 구조화 행** `(여행자, 카테고리/장소, 호오)`로 저장해 추천 시 컨텍스트에 직접 주입. **pgvector·임베딩은 v1 보류.** (투표는 v1 미구현)
- 재개: 재시작·방 재오픈 시 새 세션에 상태 스냅샷+방 요약 주입.
- **완료 기준**: 방을 닫았다 열어도, 서버를 재시작해도 이전 맥락(후보 풀·확정 일정·선호) 유지.

### Task 6. 프론트 (React + Kakao Map JS)
- **구조화 출력 계약 = UI 툴 호출.** 에이전트가 `present_place_options` / `present_itinerary` / `present_map` 등 in-process 툴을 호출하면, 백엔드가 그 JSON args를 카드 페이로드로 프론트에 전달(프론트가 텍스트를 추측 파싱하지 않음).
- 카드 종류: 장소 옵션(검색 결과 → "추가"로 후보 풀 등록) / 일정 타임라인 / 옵션 비교 / 지도.
- 참고 프로토타입: 이미 만든 `jeju_itinerary.html`, `course_agent_design.html`의 카드/타임라인/지도 패턴 재사용.
- **완료 기준**: 에이전트 응답이 채팅 버블이 아닌 인터랙티브 카드로 표시되고, 장소 옵션 카드의 "추가"로 후보 풀에 등록됨.

---

## 5. 반드시 지킬 제약

- **약관(중요)**: Anthropic은 제3자 제품이 claude.ai 구독/로그인으로 인증하는 것을 금지.
  → 외부 출시 빌드는 **반드시 `BACKEND=api`**. CLI(구독) 경로는 개인 개발·사내 내부 도구로만.
  (2026-06-15부터 구독 플랜 Agent SDK 사용량은 별도 월 크레딧으로 분리.)
  → **v1 = 폐쇄 베타(API 소수 초대), `BACKEND=api`.** 사용자 토큰 비용 부담 주체·과금·정식 쿼터는 외부 공개 시점으로 미룸.
- **보안**: Agent SDK 기본 포함 bash·파일편집 툴은 차단. `allowed_tools` 화이트리스트만.
- **비용**: 응답 게이트 + 프롬프트 캐싱 + 모델 티어링 + 방별 예산 캡 4종 모두 적용.
- **세션 동시성**: 방별 락 없이 동시 query 금지(컨텍스트 손상).

---

## 6. 환경 / 설치

```bash
python -V                      # 3.10+
pip install claude-agent-sdk   # CLI 바이너리 번들됨(v0.1.8+)
pip install fastapi uvicorn websockets
# Supabase/pgvector, Kakao REST 키는 .env 로 주입
```

`.env` 예시:
```
BACKEND=api
ANTHROPIC_API_KEY=sk-ant-...
KAKAO_REST_API_KEY=...
SUPABASE_URL=...
SUPABASE_KEY=...
```

---

## 7. 참고 링크

- Agent SDK 개요: https://docs.claude.com/en/docs/agent-sdk/overview
- 멀티 서브에이전트 예제: `anthropics/claude-agent-sdk-demos` (오케스트레이터 구조 참고)

---

## 8. 첫 작업 지시 (Claude Code에 그대로 전달용)

> `agent_backend.py`를 기반으로 **Task 1(그룹챗 코어)**부터 시작해줘.
> FastAPI WebSocket `/ws/{room_id}`, 방별 `AgentSession` + `asyncio.Lock` 직렬화,
> 발화자 태그 퍼널링, **명시적 호출(`@봇` 멘션·슬래시 커맨드) 트리거, 1~2초 디바운스, 논블로킹+큐**까지 구현하고,
> 두 클라이언트가 동시에 떠드는 상황을 재현하는 간단한 테스트도 함께 작성해줘.
> 약관·보안 제약(5절)은 코드 주석으로 남겨줘.
