// SSR 렌더 검증용 진입점 — App을 정적 마크업으로 렌더해 런타임 오류를 잡는다.
// (브라우저 없이 React 트리가 실제로 렌더되는지 확인. useEffect/WS는 SSR에서 실행 안 됨.)
import { renderToStaticMarkup } from "react-dom/server";
import App from "./src/App.jsx";

const html = renderToStaticMarkup(<App />);
// 기본 진입 화면은 로비(URL에 room 없음) — 브랜드와 방 만들기 진입이 렌더되는지 확인.
const ok = html.includes("여행봇") && html.includes("새 여행 방 만들기");
console.log(`[ssr-check] rendered ${html.length} chars; markers ${ok ? "OK" : "MISSING"}`);
process.exit(ok ? 0 : 1);
