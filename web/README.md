# 프론트엔드 (web)

Claude Design 핸드오프(개선판, UX 리뷰 반영)를 레포에 들여온 **실행 가능한 디자인 구현**.
**하나의 반응형 React 앱**이 데스크톱·모바일을 모두 처리한다(≤760px에서 모바일 레이아웃).

## 파일
- `index.html` — 앱 진입 (React + Babel standalone, CDN 로드)
- `mobile.html` — 모바일 미리보기 (390px 폰 프레임으로 `index.html`을 iframe)
- `styles.css` — 디자인 토큰·컴포넌트·반응형
- `*.jsx` — icons / data / map / cards / panel / chat / lobby / app (+ tweaks-panel)

## 실행
정적 파일이라 아무 정적 서버로 열면 된다(CDN에서 React·Babel을 받으므로 인터넷 필요):
```
cd web && python3 -m http.server 5500
# http://localhost:5500/            앱(반응형)
# http://localhost:5500/mobile.html  모바일 미리보기
```
또는 브라우저 창을 760px 이하로 줄이거나 개발자도구 기기 모드로 모바일 확인.

## 배포
정적 → **Cloudflare Pages**(루트=`web/`). 빌드 없이 그대로 호스팅 가능.

## 현재 상태 = 디자인 프로토타입(데모 데이터)

`HANDOFF.md` 기준, 운영 전 처리할 "구현팀 인계" 항목:
1. **데모 인텔리전스 제거** — `data.jsx`의 `classifyIntent`(정규식)·`Scenario.*`(하드코딩)는 데모용. 실제는 백엔드 게이트B + 서브에이전트가 판단하고, 프론트는 `present_*` 카드 페이로드만 수신·렌더.
2. **백엔드 연동** — WebSocket `/ws/{room_id}` + `present_*` 카드.
3. **실제 지도** — 손그림 제주 일러스트(고정 좌표) → Kakao Map JS(위경도). 다지역(부산·통영) 대응 위해 지도 컴포넌트 재작성.
4. **실데이터 필드** — 영업시간(WebSearch + "확인 필요" 톤)·거리(숙소 기준 동적)·평점 폴백.
5. **에러/로딩 풀세트** — 일정 생성 타임아웃·부분결과·재시도, WS 재연결, 권한 만료.
6. **확정본/작업본 뷰 분리**, **권한 엣지케이스**.
7. **데모 제거** — Tweaks 패널, 역할(여행자/방장) 토글, 데모 시계.
8. **용어 정합** — 데모 데이터의 `멤버`→`여행자`, 라벨 `코스`→`일정`(제품명 제외). `../docs/TERMS.md` 기준.
9. (선택) **Babel standalone → Vite 번들**(프로덕션 성능). node/npm 사용 가능.

> 원본 핸드오프 전체(README·chat·HANDOFF·컴포넌트)는 `../design/web/`에 보존.
