# 여행 코스 에이전트 (tour-agent)

여러 여행자가 한 **방**에 모여 **봇**을 명시적으로 호출해 장소를 검색·등록하고,
봇이 **숙소**와 **동선**을 고려해 짜 주는 **일정**을 함께 다듬다가 **방장**이 확정하는
그룹 협업 웹앱. Claude Agent SDK 기반, CLI/API 두 실행 경로 지원.

## 현황

백엔드(Task 1~5) 구현·검증 완료 — **42개 테스트 통과**. 프론트(Task 6)는 디자인 핸드오프 단계.

| 영역 | 내용 |
|---|---|
| 그룹챗 코어 | 명시적 트리거(@봇·슬래시)·발화자 퍼널링·방별 락 직렬화·디바운스·논블로킹+큐 |
| 라우팅 게이트 | 단순/작업 분기·방 상태 스냅샷 주입·방별 일일 예산 캡 |
| Kakao 툴 | 장소 검색·동선(거리/소요시간)·영업시간은 WebSearch 교차 확인 |
| 서브에이전트 | 일정 설계 / **동선 최적화(결정적 NN+2-opt)** / 검증 |
| 상태·메모리 | 후보 풀·작업 일정·확정 스냅샷·선호 — 앱 상태가 진실의 원천(Supabase seam) |

## 구조

```
src/tour_agent/
  groupchat.py   그룹챗 코어 (트리거·퍼널링·락·디바운스·큐)
  app.py         FastAPI /ws/{room_id}
  routing.py     라우팅 게이트 (분기·스냅샷·예산)
  kakao.py       Kakao Local·Mobility 래퍼 (+ httpx 전송)
  kakao_tools.py 에이전트 툴 노출
  route.py       결정적 동선 최적화 (NN + 2-opt)
  itinerary.py   설계→동선→검증 오케스트레이션
  subagents.py   서브에이전트 정의 (SDK seam)
  state.py       RoomState·StateStore (인메모리 + Supabase seam)
  factory.py     방 단위 파이프라인 합성
  agent_runner.py / agent_backend.py / main.py
tests/           42 테스트 (9개 파일)
docs/            TASK / UX / DESIGN_BRIEF
CONTEXT.md       도메인 용어집
```

## 실행

```bash
python -m venv .venv && .venv/bin/pip install -e . fastapi "uvicorn[standard]" websockets httpx
.venv/bin/python -m pytest -W ignore                      # 42 passed

BACKEND=api ANTHROPIC_API_KEY=... KAKAO_REST_API_KEY=... \
  .venv/bin/python -m tour_agent.main                     # ws://localhost:8000/ws/{room_id}
```

## 제약

- **약관**: 외부 출시 빌드는 반드시 `BACKEND=api`. CLI(구독)는 개인·사내 도구로만.
- **보안**: bash·파일편집 등 위험 툴 노출 금지(화이트리스트).
- 외부 의존(Anthropic·Kakao·Supabase)은 인터페이스로 격리 — 키는 런타임에 주입.
