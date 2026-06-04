# 프론트엔드 (web) — Vite + React 라이브 앱

백엔드 WebSocket에 연결해 동작하는 라이브 앱. (원본 디자인 프로토타입은 `../design/web/`에 보존)

## 실행
```
cd web
npm install
npm run dev        # 개발 서버(기본 http://localhost:5173)
npm run build      # 프로덕션 빌드 → dist/
```
백엔드를 먼저 띄운다(다른 터미널):
```
cd .. && BACKEND=api ANTHROPIC_API_KEY=... KAKAO_REST_API_KEY=... \
  .venv/bin/python -m tour_agent.main      # ws://localhost:8000
```

## 설정
- 백엔드 WS 주소: `VITE_WS_BASE`(기본 `ws://<host>:8000`). 예: `VITE_WS_BASE=wss://api.example.com npm run build`
- 방·내 이름: URL 쿼리 `?room=jeju&me=민수`

## 동작
- 연결되면 헤더에 `● 연결됨`. 입력창에서 메시지 전송 → 방 전체에 공유(에코로 렌더).
- 봇은 **명시적 호출**(`@봇` 또는 `/일정` 등)에만 응답 → present_* 카드(`{type:"card"}`)로 렌더.
- 검색 카드의 "추가" → `add_candidate` 액션 → 상태(`{type:"state"}`) 브로드캐스트 → 후보 패널 갱신.
- 작업 일정이 있으면 "일정 확정(방장)" → `confirm_itinerary` 액션.

## 파일
- `src/App.jsx` — 라이브 앱(채팅·카드·상태·액션)
- `src/ws.js` — WS 클라이언트(ESM)
- `src/icons.jsx` — 아이콘
- `src/styles.css` — 디자인 토큰/스타일(프로토타입에서 포팅)
- `ws.js`(루트) — UMD 버전(node e2e 검증용)

## 배포
정적 빌드(`dist/`) → **Cloudflare Pages**. `VITE_WS_BASE`를 백엔드(Fly 등) WSS 주소로 빌드.

## 남은 폴리시 (HANDOFF 기준)
디자인 전체 화면(로비·옵션비교·지도 실연동·모바일 바텀시트·에러/로딩 풀세트) 픽셀 파리티는 점진 폴리시. 현재는 라이브 핵심 흐름(연결·채팅·검색카드→후보·일정→확정) 동작.
