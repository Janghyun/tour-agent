/* panel.jsx — 사이드 패널(ESM): 후보 · 일정 · 지도 탭. 디자인 원본을 우리 백엔드 데이터
 * (candidates·preferences·working_itinerary)에 맞춰 포팅. 선호는 set_preference로 토글한다. */
import { lazy, Suspense } from "react";
import { Icon } from "./icons.jsx";
import { CAT, catKey } from "./constants.js";
import { placeLink } from "./links.js";

// 실제 지도(OpenStreetMap)는 leaflet(브라우저 전용)이라 lazy 로드 — 지도 탭 열 때만 가져온다(SSR 안전).
const MapCanvas = lazy(() => import("./mapcanvas.jsx"));

const AVA_COLORS = ["#1F8A5B", "#FF7A59", "#2F86C7", "#9B6FE0", "#E0567B", "#E8962F"];
function avaColor(name = "") {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVA_COLORS[h % AVA_COLORS.length];
}
function Thumb({ cat, size = 42 }) {
  const c = CAT[cat] || CAT.sight;
  return <span style={{ width: size, height: size, borderRadius: 10, display: "grid", placeItems: "center", fontSize: size * 0.46, background: c.pill, flex: "none" }}>{c.emoji}</span>;
}
function CatPill({ cat }) {
  const c = CAT[cat] || CAT.sight;
  return <span className="cat-pill" style={{ background: c.pill, color: c.pinkText }}>{c.emoji} {c.label}</span>;
}
function Ava({ name, size = 17 }) {
  return <span className="la" style={{ width: size, height: size, background: avaColor(name) }}>{(name || "?")[0]}</span>;
}

/* 선호 집계: preferences[{traveler,target,sentiment}] -> 장소별 like/dislike 한 사람 목록 */
function prefsFor(preferences, id) {
  const likes = [], dislikes = [];
  for (const p of preferences || []) {
    if (p.target !== id) continue;
    (p.sentiment === "like" ? likes : dislikes).push(p.traveler);
  }
  return { likes, dislikes };
}

function CandidateTab({ candidates, preferences, me, onToggleLike, onToggleDislike, onRemove, onFocusMap }) {
  if (candidates.length === 0) {
    return (
      <div className="empty" style={{ paddingTop: 24, textAlign: "center" }}>
        <span className="emoji" style={{ display: "inline-flex" }}><Icon.pin s={28} /></span>
        <div className="et">아직 담은 후보가 없어요</div>
        <div className="ed">봇에게 장소를 검색하면 옵션 카드가 떠요. 카드에서 ‘추가’를 누르면 방 전체가 함께 보는 후보 풀에 담깁니다.</div>
        <div className="ex">예) <span className="k">@봇</span> 성산 근처 흑돼지 · <span className="k">/검색</span> 우도 카페</div>
      </div>
    );
  }
  return (
    <>
      <div className="cand-head" style={{ paddingTop: 6 }}>
        <div className="h"><Icon.pin s={17} style={{ color: "var(--accent)" }} /> 후보 장소 <span style={{ color: "var(--ink-3)", fontWeight: 700 }}>{candidates.length}</span></div>
        <div className="sub">방 전체가 공유하는 방문 후보 풀이에요.</div>
      </div>
      <div className="cand-list">
        {candidates.map((c) => {
          const cat = catKey(c.category);
          const { likes, dislikes } = prefsFor(preferences, c.id);
          const meLike = likes.includes(me);
          const meDislike = dislikes.includes(me);
          return (
            <div className="cand" key={c.id}>
              <a href={placeLink(c)} target="_blank" rel="noreferrer" title="지도에서 자세히 보기" style={{ textDecoration: "none" }}>
                <Thumb cat={cat} size={42} />
              </a>
              <div className="ci">
                <div className="nm">
                  <a href={placeLink(c)} target="_blank" rel="noreferrer" title="지도에서 자세히 보기"
                     style={{ color: "inherit", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {c.name}<Icon.search s={12} style={{ color: "var(--ink-4)", verticalAlign: "-1px" }} />
                  </a>
                </div>
                <div className="meta"><CatPill cat={cat} />{c.category ? <span>{c.category}</span> : null}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <button className={"react-btn like" + (meLike ? " on" : "")} onClick={() => onToggleLike(c.id)}>
                    {meLike ? <Icon.heartFill s={13} /> : <Icon.heart s={13} />} {likes.length || ""}
                  </button>
                  {likes.length > 0 && <div className="liked-avas">{likes.slice(0, 3).map((n) => <Ava key={n} name={n} />)}</div>}
                  <button className={"react-btn dislike" + (meDislike ? " on" : "")} style={{ marginLeft: "auto" }} onClick={() => onToggleDislike(c.id)} title="별로예요(집계만)">
                    <Icon.thumbDown s={13} /> {dislikes.length || ""}
                  </button>
                </div>
              </div>
              <div className="cand-acts" style={{ flexDirection: "column", alignSelf: "stretch", justifyContent: "space-between" }}>
                <button className="icon-mini" title="지도에서 보기" onClick={() => onFocusMap(c.id)}><Icon.pin s={15} /></button>
                <button className="icon-mini" title="후보에서 삭제" onClick={() => onRemove(c.id)}><Icon.trash s={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ItineraryTab({ itinerary, confirmed, isHost, onConfirm }) {
  if (!itinerary || itinerary.length === 0) {
    return (
      <div className="empty" style={{ textAlign: "center", paddingTop: 24 }}>
        <span className="emoji" style={{ display: "inline-flex" }}><Icon.calendar s={28} /></span>
        <div className="et">아직 작업 중 일정이 없어요</div>
        <div className="ed">후보를 충분히 담은 뒤 봇에게 일정을 부탁하면, 동선과 숙소를 고려해 하나의 일정을 짜 줘요.</div>
        <div className="ex">예) <span className="k">@봇</span> 후보로 2박 3일 일정 짜줘 · <span className="k">/일정</span></div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="itin-head">
        <div className="row1">
          <span className="h">작업 중 일정</span>
          {confirmed
            ? <span className="status-dot confirmed"><Icon.check s={13} /> 확정됨</span>
            : <span className="status-dot draft"><Icon.edit s={12} /> 작업 중</span>}
        </div>
        <div className="relate"><span>방마다 작업 중 일정은 하나예요. 봇에게 수정을 요청하면 이 일정이 바뀝니다.</span></div>
      </div>
      <div className="panel-body scroll" style={{ flex: 1, paddingTop: 8 }}>
        <ol className="route-list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {itinerary.map((p, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center", flex: "none" }}>{i + 1}</span>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</span>
            </li>
          ))}
        </ol>
      </div>
      {isHost ? (
        <div className="confirm-bar host">
          <Icon.crown s={16} style={{ color: "var(--coral, #E0567B)" }} />
          <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600, flex: 1 }}>방장 권한</span>
          <button className="btn btn-pri btn-sm" onClick={onConfirm}><Icon.flag s={14} /> {confirmed ? "다시 확정" : "일정 확정"}</button>
        </div>
      ) : (
        <div className="confirm-bar">
          <Icon.user s={15} style={{ color: "var(--ink-3)" }} />
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>확정은 방장만 할 수 있어요. 수정 요청은 누구나 가능해요.</span>
        </div>
      )}
    </div>
  );
}

function MapTab({ candidates, accommodations, selectedId, onSelect }) {
  // panel-body가 지도 탭에서 display:flex(가로)라 래퍼를 flex:1로 폭을 채워야 지도가 보인다.
  return (
    <div style={{ flex: 1, minWidth: 0, width: "100%", height: "100%", position: "relative", borderRadius: "var(--r)", overflow: "hidden" }}>
      <Suspense fallback={<div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 13 }}>지도 불러오는 중…</div>}>
        <MapCanvas candidates={candidates} accommodations={accommodations} selectedId={selectedId} onSelect={onSelect} />
      </Suspense>
    </div>
  );
}

const TABS = [
  { id: "cand", label: "후보", icon: "pin" },
  { id: "itin", label: "일정", icon: "calendar" },
  { id: "map", label: "지도", icon: "map" },
];

export function SidePanel(props) {
  const { candidates, itinerary, tab, setTab, width = 320 } = props;
  const counts = { cand: candidates.length, itin: itinerary?.length || 0, map: 0 };
  return (
    <div className="panel" role="region" aria-label="여행 패널" style={{ width, flex: "none", background: "var(--surface-2)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="panel-tabs pill" role="tablist" style={{ display: "flex", gap: 6, padding: 10, borderBottom: "1px solid var(--line)" }}>
        {TABS.map((t) => {
          const Ico = Icon[t.icon];
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={"ptab" + (tab === t.id ? " on" : "")} onClick={() => setTab(t.id)}>
              <Ico s={16} /> {t.label}
              {counts[t.id] > 0 && <span className="count">{counts[t.id]}</span>}
            </button>
          );
        })}
      </div>
      <div className="panel-body scroll" style={{ flex: 1, overflowY: "auto", padding: 14, display: tab === "map" ? "flex" : "block" }}>
        {tab === "cand" && <CandidateTab {...props} />}
        {tab === "itin" && <ItineraryTab {...props} />}
        {tab === "map" && <MapTab {...props} />}
      </div>
    </div>
  );
}
