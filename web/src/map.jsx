/* map.jsx — 좌표 기반 지도(ESM). 디자인 원본의 제주 일러스트는 제주 전용이라,
 * 어떤 여행지에서도 쓰도록 실좌표(경위도)를 패널 영역에 정규화해 핀을 배치한다.
 * 좌표가 없는 장소(Kakao 미검색)는 지도에 못 올리므로 안내한다. */
import { CAT, catKey } from "./constants.js";

export function MapView({ candidates = [], accommodations = [], selectedId = null, onSelect = () => {} }) {
  const pts = [];
  candidates.forEach((c) => { if (c.x && c.y) pts.push({ id: c.id, name: c.name, cat: catKey(c.category), x: +c.x, y: +c.y, kind: "cand" }); });
  accommodations.forEach((a, i) => { if (a.x && a.y) pts.push({ id: "acc" + i, name: a.name, cat: "lodging", x: +a.x, y: +a.y, kind: "lodging" }); });

  if (pts.length === 0) {
    return (
      <div className="empty" style={{ padding: "36px 18px", textAlign: "center" }}>
        <span className="emoji" style={{ display: "inline-flex", marginBottom: 8 }}>🗺️</span>
        <div className="et">지도에 표시할 위치가 없어요</div>
        <div className="ed">후보 장소에 좌표가 있어야 지도에 핀으로 보여요. Kakao 검색으로 추가한 장소는 자동으로 표시됩니다.</div>
      </div>
    );
  }

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 14;
  const nx = (v) => (maxX === minX ? 50 : pad + ((v - minX) / (maxX - minX)) * (100 - 2 * pad));
  const ny = (v) => (maxY === minY ? 50 : pad + ((maxY - v) / (maxY - minY)) * (100 - 2 * pad)); // 위도가 클수록 위로

  return (
    <div className="map-wrap" style={{ position: "relative", height: "100%", minHeight: 320, borderRadius: "var(--r)", overflow: "hidden", background: "linear-gradient(160deg, #DCEEF6, #EAF3EC)" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
        <defs>
          <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M36 0H0V36" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      {pts.map((pn) => {
        const c = CAT[pn.cat] || CAT.sight;
        const sel = selectedId === pn.id;
        const isLodge = pn.kind === "lodging";
        return (
          <button key={pn.id} className="map-pin" onClick={() => onSelect(pn.id)}
            aria-label={`${pn.name}${isLodge ? " (숙소)" : ""}`}
            style={{ position: "absolute", left: nx(pn.x) + "%", top: ny(pn.y) + "%", transform: `translate(-50%,-100%) scale(${sel ? 1.18 : 1})`, transformOrigin: "bottom center", zIndex: sel ? 7 : isLodge ? 5 : 4, transition: "transform .18s", border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
            <svg width="32" height="40" viewBox="0 0 34 42">
              <path d="M17 41C17 41 32 24 32 14A15 15 0 1 0 2 14C2 24 17 41 17 41Z" fill={isLodge ? CAT.lodging.bg : c.bg} stroke="#fff" strokeWidth="2.5" />
              {isLodge ? <text x="17" y="20" textAnchor="middle" fontSize="13" fill="#fff">🛏</text> : <circle cx="17" cy="14" r="5.5" fill="#fff" />}
            </svg>
            {sel && (
              <span style={{ position: "absolute", left: "50%", top: "calc(100% + 4px)", transform: "translateX(-50%)", whiteSpace: "nowrap", background: "var(--ink)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 7, boxShadow: "var(--sh-2)" }}>{pn.name}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
