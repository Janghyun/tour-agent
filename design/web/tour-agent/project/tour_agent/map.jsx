/* map.jsx — 스타일라이즈된 제주 일러스트 지도 (핀 · 동선 선) */
const { CAT: M_CAT, PLACES: M_PLACES, place: m_place } = window.TA_DATA;

/* 제주 랜드마스 (viewBox 0 0 600 420) — 손으로 다듬은 블롭 */
const JEJU_PATH = "M104,243 C70,214 78,168 128,150 C150,108 214,86 268,96 C300,72 366,70 418,92 C470,80 540,104 556,156 C586,190 580,236 540,258 C520,300 452,330 388,322 C340,346 268,346 220,320 C160,318 116,290 104,243 Z";

function MapView({ candidates = [], itinerary = null, selectedId = null, onSelect = () => {}, showRoute = true, dimWater = false }) {
  const W = 600, H = 420;

  // 후보 + 일정 + 숙소 핀 수집 (중복 제거, 일정 우선)
  const pinMap = {};
  candidates.forEach((c) => { pinMap[c.id] = { id: c.id, kind: "cand" }; });
  const dayColors = ["#1F8A5B", "#2F86C7"];
  const routes = [];
  if (itinerary) {
    itinerary.days.forEach((day, di) => {
      const seq = [];
      const lp = m_place(day.lodging);
      if (lp) { pinMap[lp.id] = { id: lp.id, kind: "lodging" }; }
      let n = 0;
      day.stops.forEach((s) => {
        if (s.move) return;
        n++;
        pinMap[s.id] = { id: s.id, kind: "stop", num: n, day: di };
        const p = m_place(s.id);
        if (p) seq.push([p.x, p.y]);
      });
      if (seq.length > 1) routes.push({ pts: seq, color: dayColors[di % 2] });
    });
  }
  const pins = Object.values(pinMap).map((pp) => ({ ...pp, p: m_place(pp.id) })).filter((x) => x.p);

  const pct = (v, max) => (v / max) * 100;

  return (
    <div className="map-wrap" role="group" aria-label="여행 동선 지도. 핀과 동선이 표시됩니다. 일정 탭의 타임라인에서 같은 정보를 텍스트로 볼 수 있어요.">
      <svg className="map-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#DCEEF6"/>
            <stop offset="1" stopColor="#C7E3F0"/>
          </linearGradient>
          <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F3EEE2"/>
            <stop offset="1" stopColor="#E9E0CE"/>
          </linearGradient>
          <radialGradient id="halla" cx="0.5" cy="0.4" r="0.6">
            <stop offset="0" stopColor="#CFE6D6"/>
            <stop offset="1" stopColor="#E9E0CE"/>
          </radialGradient>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#2B2722" floodOpacity="0.10"/>
          </filter>
        </defs>

        {/* 바다 */}
        <rect x="0" y="0" width={W} height={H} fill="url(#water)"/>
        {/* 잔잔한 물결 */}
        {[60, 110, 300, 360].map((y, i) => (
          <path key={i} d={`M${i%2?40:0},${y} q40,-9 80,0 t80,0 t80,0 t80,0 t80,0 t80,0`}
                fill="none" stroke="#B4D8E8" strokeWidth="1.6" opacity={dimWater ? 0.25 : 0.5} strokeLinecap="round"/>
        ))}

        {/* 제주 본섬 */}
        <path d={JEJU_PATH} fill="url(#land)" filter="url(#soft)"/>
        <path d={JEJU_PATH} fill="none" stroke="#D8CBB2" strokeWidth="2"/>
        {/* 해안 모래 라인 */}
        <path d={JEJU_PATH} fill="none" stroke="#EFE3CC" strokeWidth="6" opacity="0.6" transform="scale(0.985)" transformOrigin="center"/>

        {/* 한라산 */}
        <circle cx="318" cy="216" r="74" fill="url(#halla)"/>
        <path d="M286,236 l22,-40 14,22 12,-30 20,48 Z" fill="#BFD9C4" stroke="#A9C8B0" strokeWidth="1.5" strokeLinejoin="round"/>
        <text x="318" y="276" textAnchor="middle" fontSize="13" fontWeight="700" fill="#7E9C84" style={{letterSpacing:"0.05em"}}>한라산</text>

        {/* 우도(작은 섬) */}
        <ellipse cx="548" cy="150" rx="20" ry="14" fill="url(#land)" stroke="#D8CBB2" strokeWidth="1.5"/>

        {/* 주요 도로 (장식) */}
        <path d="M150,200 C260,150 400,160 520,210" fill="none" stroke="#EAD9B8" strokeWidth="4" strokeLinecap="round" opacity="0.8"/>
        <path d="M200,150 C260,230 360,280 470,300" fill="none" stroke="#EAD9B8" strokeWidth="4" strokeLinecap="round" opacity="0.8"/>

        {/* 동선 (일정) */}
        {showRoute && routes.map((r, ri) => (
          <polyline key={ri} points={r.pts.map((p) => p.join(",")).join(" ")}
                    fill="none" stroke={r.color} strokeWidth="3" strokeDasharray="2 8"
                    strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
        ))}
      </svg>

      {/* 핀 (HTML 오버레이) */}
      {pins.map((pn) => {
        const c = M_CAT[pn.p.cat];
        const sel = selectedId === pn.id;
        const isLodge = pn.kind === "lodging";
        const isStop = pn.kind === "stop";
        return (
          <button key={pn.id} className="map-pin" onClick={() => onSelect(pn.id)}
            aria-label={`${pn.p.name} (${M_CAT[pn.p.cat].label}${isLodge ? ", 숙소" : isStop ? `, 일정 ${pn.num}번` : ""})`}
            style={{
              position: "absolute", left: pct(pn.p.x, W) + "%", top: pct(pn.p.y, H) + "%",
              transform: `translate(-50%,-100%) scale(${sel ? 1.18 : 1})`, transformOrigin: "bottom center",
              zIndex: sel ? 7 : (isStop ? 5 : 4), transition: "transform .18s cubic-bezier(.2,.7,.2,1)",
              filter: sel ? "drop-shadow(0 6px 10px rgba(43,39,34,.3))" : "drop-shadow(0 3px 5px rgba(43,39,34,.22))",
            }}>
            <svg width="34" height="42" viewBox="0 0 34 42">
              <path d="M17 41C17 41 32 24 32 14A15 15 0 1 0 2 14C2 24 17 41 17 41Z"
                    fill={isLodge ? M_CAT.lodging.bg : c.bg} stroke="#fff" strokeWidth="2.5"/>
              {isStop ? (
                <text x="17" y="19" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff">{pn.num}</text>
              ) : isLodge ? (
                <text x="17" y="20" textAnchor="middle" fontSize="13" fill="#fff">🛏</text>
              ) : (
                <circle cx="17" cy="14" r="5.5" fill="#fff"/>
              )}
            </svg>
            {sel && (
              <span style={{
                position:"absolute", left:"50%", top:"calc(100% + 4px)", transform:"translateX(-50%)",
                whiteSpace:"nowrap", background:"var(--ink)", color:"#fff", fontSize:"11px", fontWeight:700,
                padding:"3px 8px", borderRadius:"7px", boxShadow:"var(--sh-2)",
              }}>{pn.p.name}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
window.MapView = MapView;
