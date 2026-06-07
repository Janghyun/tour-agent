/* 봇 카드 컴포넌트 — 디자인 프로토타입에서 포팅, 백엔드 present_* 페이로드로 구동.
 * styles.css의 .card/.place-row/.tl 등 디자인 클래스를 사용. 카테고리는 catKey로 정규화. */
import { lazy, Suspense, useState } from "react";
import { Icon } from "./icons.jsx";
import { CAT, catKey, shade } from "./constants.js";

// 실제 지도 모달은 leaflet(브라우저 전용)이라 lazy 로드 — 열 때만 가져온다(SSR 안전).
const MapModal = lazy(() => import("./mapmodal.jsx"));

export function Thumb({ cat, size = 52 }) {
  const c = CAT[cat] || CAT.sight;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size > 44 ? 12 : 9,
        display: "grid", placeItems: "center", flex: "none", fontSize: size * 0.42,
        background: `linear-gradient(140deg, ${c.bg}, ${shade(c.bg, -14)})`,
        boxShadow: `0 4px 10px ${c.bg}38`,
      }}
    >
      {c.emoji}
    </div>
  );
}

export function CatPill({ cat }) {
  const c = CAT[cat] || CAT.sight;
  return <span className="cat-pill" style={{ background: c.pill, color: c.pinkText }}>{c.label}</span>;
}

// 장소의 외부 링크 — 봇이 준 place_url, 없으면 이름으로 카카오맵 검색.
function placeLink(o) {
  return o.place_url || `https://map.kakao.com/?q=${encodeURIComponent(o.name || "")}`;
}

export function PlaceOptionsCard({ card, addedIds, onAdd }) {
  const opts = card.options || [];
  return (
    <div className="card pop-in">
      <div className="card-head">
        <div className="ico" style={{ background: "var(--accent-50)", color: "var(--accent)" }}><Icon.pin s={17} /></div>
        <div>
          <div className="t">{card.title || "검색 결과"}</div>
          <div className="s">{opts.length}곳</div>
        </div>
        <div className="grow"></div>
        <span className="card-tag" style={{ background: "var(--accent-50)", color: "var(--accent-700)" }}>검색</span>
      </div>
      <div className="place-list">
        {opts.map((o, i) => {
          const k = catKey(o.category);
          const id = o.id || o.name;
          const added = addedIds?.has(id);
          return (
            <div className="place-row" key={i}>
              <a href={placeLink(o)} target="_blank" rel="noreferrer" title="카카오맵에서 자세히 보기"
                 style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
                <Thumb cat={k} />
                <div className="place-info">
                  <div className="nm">{o.name} <CatPill cat={k} /> <Icon.search s={12} style={{ color: "var(--ink-4)", verticalAlign: "-1px" }} /></div>
                  <div className="meta">
                    <span>{o.category || CAT[k].label}</span>
                    {o.address && <><span className="dot"></span><span>{o.address}</span></>}
                    {o.distance_m != null && <><span className="dot"></span><span>{o.distance_m}m</span></>}
                  </div>
                </div>
              </a>
              <div className="place-actions">
                {added ? (
                  <span className="btn btn-added btn-sm"><Icon.check s={15} /> 담음</span>
                ) : (
                  <button className="btn btn-pri btn-sm" onClick={() => onAdd(o)}><Icon.plus s={15} /> 추가</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="card-foot">
        <Icon.pin s={15} style={{ color: "var(--accent)" }} />
        <span className="note">장소를 누르면 카카오맵에서 자세히 볼 수 있어요. <b>추가</b>는 후보에 담겨 방 전체에 공유돼요(영업시간은 확인 필요).</span>
      </div>
    </div>
  );
}

// 일정 카드 안 미니맵 — 숙소(🏠 출발) + 항목 번호 핀 + 동선(점선). 핀을 누르면 장소 정보.
function ItinMiniMap({ stops, lodging, title }) {
  const [sel, setSel] = useState(null);
  const [big, setBig] = useState(false);
  const itemPts = stops.filter((s) => s.x && s.y).map((s) => ({ name: s.name, x: +s.x, y: +s.y, cat: catKey(s.category), category: s.category, place_url: s.place_url }));
  const lodge = lodging && lodging.x && lodging.y
    ? { name: lodging.name || "숙소", x: +lodging.x, y: +lodging.y, cat: "lodging", category: "숙소", place_url: lodging.place_url, isLodge: true }
    : null;
  const pts = lodge ? [lodge, ...itemPts] : itemPts;
  if (pts.length < 2) return null;
  let n = 0;
  const labels = pts.map((p) => (p.isLodge ? "🏠" : String(++n)));
  const W = 100, H = 58, pad = 12;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const nx = (v) => (maxX === minX ? W / 2 : pad + ((v - minX) / (maxX - minX)) * (W - 2 * pad));
  const ny = (v) => (maxY === minY ? H / 2 : pad + ((maxY - v) / (maxY - minY)) * (H - 2 * pad));
  const co = pts.map((p) => [nx(p.x), ny(p.y)]);
  const s = sel != null ? pts[sel] : null;
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 150, display: "block", background: "linear-gradient(160deg,#DCEEF6,#EAF3EC)", borderRadius: 10 }} role="img" aria-label={`동선 지도: ${pts.map((p) => p.name).join(" 다음 ")}`}>
        <polyline points={co.map((c) => c.join(",")).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeDasharray="2.4 2.4" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: "pointer" }}>
            <circle cx={co[i][0]} cy={co[i][1]} r={sel === i ? 5.8 : 4.6} fill={(CAT[p.cat] || CAT.sight).bg} stroke="#fff" strokeWidth={sel === i ? 1.8 : 1.3} />
            <text x={co[i][0]} y={co[i][1] + (p.isLodge ? 1.5 : 1.7)} textAnchor="middle" fontSize={p.isLodge ? 4 : 4.6} fontWeight="700" fill="#fff" style={{ pointerEvents: "none" }}>{labels[i]}</text>
          </g>
        ))}
      </svg>
      <span style={{ position: "absolute", left: 8, bottom: 6, fontSize: 10.5, color: "var(--ink-3)", background: "rgba(255,255,255,.7)", borderRadius: 6, padding: "1px 6px" }}>🏠 숙소 출발 · 번호=방문 순서</span>
      <button onClick={() => setBig(true)} title="실제 지도로 크게 보기"
              style={{ position: "absolute", right: 8, bottom: 6, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--accent-700)", background: "rgba(255,255,255,.85)", border: "1px solid var(--line)", borderRadius: 8, padding: "3px 8px", cursor: "pointer" }}>
        <Icon.map s={13} /> 지도 확대
      </button>
      {big && (
        <Suspense fallback={null}>
          <MapModal stops={stops} lodging={lodge} title={title} onClose={() => setBig(false)} />
        </Suspense>
      )}
      {s && (
        <div style={{ position: "absolute", left: 8, right: 8, top: 8, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--sh-2)", padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", background: (CAT[s.cat] || CAT.sight).bg, color: "#fff", fontSize: s.isLodge ? 12 : 12, fontWeight: 800, display: "grid", placeItems: "center" }}>{labels[sel]}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}{s.isLodge ? " (숙소)" : ""}</div>
            <div style={{ marginTop: 2 }}><CatPill cat={s.cat} /></div>
          </div>
          <a href={placeLink(s)} target="_blank" rel="noreferrer" className="btn btn-soft btn-sm" style={{ flex: "none" }}><Icon.search s={13} /> 카카오맵</a>
          <button onClick={() => setSel(null)} aria-label="닫기" style={{ flex: "none", border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)" }}><Icon.x s={15} /></button>
        </div>
      )}
    </div>
  );
}

// 타임라인 한 항목 — 번호(지도 핀과 매칭)·시간·장소·이동시간 + (식사면) 대안 맛집 펼침.
function TlStop({ it, num }) {
  const [showAlt, setShowAlt] = useState(false);
  const alts = it.alternatives || [];
  const cat = catKey(it.category);
  return (
    <div className="tl-stop">
      <div className="node" style={num != null ? { background: (CAT[cat] || CAT.sight).bg, borderColor: "#fff", boxShadow: "0 0 0 1.5px var(--line-2)" } : undefined}>
        {num != null
          ? <span style={{ color: "#fff", fontSize: 10.5, fontWeight: 800 }}>{num}</span>
          : <i></i>}
      </div>
      <div className="tl-card">
        <span className="tl-time">{it.time || ""}</span>
        <div className="tl-body">
          <div className="nm">
            <a href={placeLink(it)} target="_blank" rel="noreferrer" title="카카오맵에서 보기" style={{ color: "inherit", textDecoration: "none" }}>
              {it.name} <Icon.search s={11} style={{ color: "var(--ink-4)", verticalAlign: "-1px" }} />
            </a>
            {it.category && <> <CatPill cat={cat} /></>}
          </div>
          {it.travel_from_prev && <div className="sub">{it.travel_from_prev}</div>}
          {alts.length > 0 && (
            <div style={{ marginTop: 5 }}>
              <button onClick={() => setShowAlt((v) => !v)} style={{ border: "none", background: "transparent", color: "var(--accent-700)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                다른 맛집 {alts.length}곳 {showAlt ? "▲" : "▼"}
              </button>
              {showAlt && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                  {alts.map((a, i) => (
                    <a key={i} href={placeLink(a)} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--ink-2)", textDecoration: "none" }}>
                      · {a.name} <Icon.search s={11} style={{ color: "var(--ink-4)", verticalAlign: "-1px" }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ItineraryCard({ card, confirmed, onExport }) {
  const days = card.days || [];
  return (
    <div className="card pop-in">
      <div className="card-head">
        <div className="ico" style={{ background: "var(--accent-50)", color: "var(--accent)" }}><Icon.calendar s={17} /></div>
        <div>
          <div className="t">{card.title || "일정"}</div>
          <div className="s">{days.length}일 · 동선·숙소 반영</div>
        </div>
        <div className="grow"></div>
        {onExport && (
          <button className="btn btn-soft btn-sm" style={{ marginRight: 6 }} onClick={() => onExport(card)} title="HTML로 저장(인쇄하면 PDF)">
            <Icon.send s={13} /> 내보내기
          </button>
        )}
        {confirmed
          ? <span className="status-dot confirmed"><Icon.check s={13} /> 확정됨</span>
          : <span className="status-dot draft"><Icon.calendar s={12} /> 작업 중</span>}
      </div>
      <div className="tl">
        {days.map((d, di) => (
          <div className="tl-day" key={di}>
            <div className="tl-day-head">
              <span className="badge">{di + 1}</span>
              <span className="dl">{d.date || `Day ${di + 1}`}</span>
              {d.accommodation && <span className="ds">· 숙소 {d.accommodation}</span>}
            </div>
            <ItinMiniMap stops={d.items || []} title={`${d.date || `Day ${di + 1}`} 동선`}
                         lodging={d.acc_x && d.acc_y ? { name: d.accommodation, x: d.acc_x, y: d.acc_y } : null} />
            <div className="tl-track">
              {(() => {
                let n = 0;
                return (d.items || []).map((it, ii) => {
                  const num = it.x && it.y ? ++n : null; // 좌표 있는 항목만 번호(지도 핀과 매칭)
                  return <TlStop key={ii} it={it} num={num} />;
                });
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompareCard({ card, addedIds, onAdd }) {
  const opts = card.options || [];
  return (
    <div className="card pop-in">
      <div className="card-head">
        <div className="ico" style={{ background: "#F0E9FB", color: "#9B6FE0" }}><Icon.search s={17} /></div>
        <div>
          <div className="t">{card.title || "대안 비교"}</div>
          {card.subtitle && <div className="s">{card.subtitle}</div>}
        </div>
        <div className="grow"></div>
        <span className="card-tag" style={{ background: "#F0E9FB", color: "#6E47B8" }}>비교</span>
      </div>
      <div className="compare-grid">
        {opts.map((o, i) => {
          const k = catKey(o.category);
          const id = o.id || o.name;
          const added = addedIds?.has(id);
          return (
            <div className="compare-opt" key={i} style={{ textAlign: "left" }}>
              <Thumb cat={k} size={40} />
              <div className="nm" style={{ fontWeight: 700, marginTop: 6 }}>{o.name}</div>
              <div style={{ margin: "3px 0 6px" }}><CatPill cat={k} /></div>
              {o.note && <div className="meta" style={{ fontSize: 12, color: "var(--ink-3)" }}>{o.note}</div>}
              {(o.pros || []).map((p, pi) => <div key={"p" + pi} style={{ fontSize: 11.5, color: "var(--accent-700)" }}>+ {p}</div>)}
              {(o.cons || []).map((c, ci) => <div key={"c" + ci} style={{ fontSize: 11.5, color: "var(--ink-3)" }}>− {c}</div>)}
              <div style={{ marginTop: 8 }}>
                {added
                  ? <span className="btn btn-added btn-sm"><Icon.check s={14} /> 담음</span>
                  : <button className="btn btn-pri btn-sm" onClick={() => onAdd(o)}><Icon.check s={14} /> 이걸로</button>}
              </div>
            </div>
          );
        })}
      </div>
      {card.slot && (
        <div className="card-foot">
          <Icon.search s={15} style={{ color: "#9B6FE0" }} />
          <span className="note">하나를 고르면 <b>{card.slot}</b> 후보로 담겨요.</span>
        </div>
      )}
    </div>
  );
}

export function MapCard({ card }) {
  const pins = card.pins || [];
  return (
    <div className="card pop-in">
      <div className="card-head">
        <div className="ico" style={{ background: "#E3F0FA", color: "#2F86C7" }}><Icon.map s={17} /></div>
        <div>
          <div className="t">동선 지도</div>
          <div className="s">핀 {pins.length}개</div>
        </div>
        <div className="grow"></div>
        <span className="card-tag" style={{ background: "#E3F0FA", color: "#1E6BA8" }}>지도</span>
      </div>
      <div className="place-list">
        {pins.map((p, i) => (
          <div className="place-row" key={i}>
            <Thumb cat={catKey(p.category)} size={34} />
            <div className="place-info">
              <div className="nm">{p.order != null ? `${p.order}. ` : ""}{p.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
