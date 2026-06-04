# 용어 표준 (TERMS)

용어를 한 곳에서 통일하기 위한 기준. **도메인 용어는 `CONTEXT.md`가 진실의 원천**이고,
이 문서는 거기에 더해 **기술 용어 표준 표기**를 정한다.

## 도메인 용어 (요약 — 정본은 CONTEXT.md)

방 · 여행자 · 방장 · 후보 장소 · 일정 · 확정 일정 · 동선 · 숙소 · 선호.
- "코스"는 **제품명**(여행봇 코스 에이전트)에만. 내부 코드·문서는 **"일정"**.
- "단톡방" 금지(외부 메신저 연상) → **"방"**.
- "찜/북마크/위시리스트" → **"후보 장소"**. "취향" → **"선호"**. "멤버/유저" → **"여행자"**.
- 투표는 v1 보류.

## 기술 용어 (표준 표기)

| 표준 표기 | 뜻 | 쓰지 말 것 |
|---|---|---|
| **Messages API** | Claude 개발자 플랫폼의 HTTP API(`client.messages.create` + tool use). `ApiAgentRunner`가 직접 호출 | raw Claude API, raw API, raw Messages API |
| **Claude Agent SDK** | Messages API를 감싼 상위 래퍼(CLI 번들·서브에이전트). `CliAgentRunner`(로컬/구독)에서만 사용 | (축약 "Agent SDK"는 허용) |
| **실행 모드 (cli / api)** | `BACKEND` 환경변수로 고르는 실행 방식 | "실행 경로"(경로는 동선과 혼동) |
| **AgentRunner** | 러너 인터페이스(`run_turn(prompt) -> str`). 구현: `ApiAgentRunner` / `CliAgentRunner` | |
| **ToolSpec** | 두 러너가 공유하는 툴 계약(이름·설명·스키마·핸들러) | |
| **present_\* 카드** | 에이전트가 프론트로 내보내는 구조화 카드(`present_place_options` / `present_itinerary` / `present_map`) | |
| **동선** | `route.py`의 결정적 최적화(NN + 2-opt) 결과. 코드 내부의 그래프 "경로(path)"와는 구분 | |

## 규칙

- 사용자 대면 문구·문서·코드 주석 모두 위 표준 표기를 쓴다.
- **"raw"를 붙이지 않는다** — 그냥 "Messages API".
- "경로"는 도메인 동선이 아니라 *그래프 경로*나 *실행 방식*을 가리킬 때만 제한적으로. 실행 방식은 "실행 모드"로 통일.
