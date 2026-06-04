/* panel.jsx — 사이드 패널: 후보 · 일정 · 지도 탭 */
const { CAT: P_CAT, place: p_place, MEMBERS: P_MEM, ME: P_ME } = window.TA_DATA;
const PIcon = window.Icon;
const { Timeline: P_Timeline, Thumb: P_Thumb, CatPill: P_CatPill } = window;

function Ava({ id, size = 17, cls = "la" }) {
  const m = P_MEM[id];
  return <span className={cls} style={{ width: size, height: size, background: m.color }}>{m.name[0]}</span>;
}

const { useState: pUS, useRef: pUR } = React;

/* ---- 외부 링크로 후보 추가 ---- */
const LINK_SAMPLES = [
  { label: "네이버 지도 · 광치기해변", url: "https://naver.me/제주-광치기-해변" },
  { label: "블로그 · 감성 카페", url: "https://blog.naver.com/jeju/제주-성산-카페-추천" },
  { label: "인스타 · 고기국수 맛집", url: "https://instagram.com/p/성산-맛집-국수" },
];
const LINK_CATS = ["food", "cafe", "sight", "nature", "activity", "lodging"];

function LinkAdd({ onAdd }) {
  const [mode, setMode] = pUS("closed"); // closed | input | loading | preview | error
  const [url, setUrl] = pUS("");
  const [pv, setPv] = pUS(null);
  const [cat, setCat] = pUS(null);
  const [err, setErr] = pUS("");
  const inputRef = pUR(null);

  const open = () => { setMode("input"); setUrl(""); setErr(""); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); };
  const reset = () => { setMode("closed"); setUrl(""); setPv(null); setCat(null); setErr(""); };
  const SUPPORTED = /naver|kakao|kko|instagram|insta|blog|youtu|tourbot/i;
  const run = (u) => {
    const link = (u != null ? u : url).trim();
    if (!link) return;
    setUrl(link); setMode("loading");
    setTimeout(() => {
      if (!/\.|:\/\//.test(link) || link.length < 5) {
        setErr("링크 형식이 올바르지 않아요. 장소의 전체 주소(URL)를 붙여넣어 주세요."); setMode("error"); return;
      }
      if (!SUPPORTED.test(link)) {
        const src = window.TA_DATA.linkSource(link);
        setErr(`‘${src.host}’ 링크는 아직 지원하지 않아요. 네이버·카카오맵·블로그·인스타 링크를 사용해 주세요.`); setMode("error"); return;
      }
      const p = window.TA_DATA.parseLink(link); setPv(p); setCat(p.cat); setMode("preview");
    }, 850);
  };
  const confirmAdd = () => { onAdd(pv, cat); reset(); };

  if (mode === "closed") {
    return (
      <div className="link-add-bar">
        <button className="link-add-btn" onClick={open}>
          <PIcon.plus s={16}/>
          <span className="grow">외부 링크로 후보 추가</span>
          <PIcon.chevR s={16} style={{ color: "var(--ink-4)" }}/>
        </button>
      </div>
    );
  }

  return (
    <div className="link-box pop-in">
      <div className="link-box-head">
        <span className="t"><PIcon.layers s={15} style={{ color: "var(--accent)" }}/> 링크로 후보 추가</span>
        <button className="x" onClick={reset}><PIcon.x s={15}/></button>
      </div>

      {mode === "input" && (
        <>
          <div className="link-input-row">
            <input ref={inputRef} className="link-input" value={url} placeholder="장소 링크 붙여넣기 (네이버/카카오맵·블로그·인스타)"
              onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run(); }}/>
            <button className="btn btn-pri" disabled={!url.trim()} onClick={() => run()} style={{ opacity: url.trim() ? 1 : .5 }}>
              <PIcon.search s={15}/> 확인
            </button>
          </div>
          <div className="link-hint">
            예시로 가져오기:
            {LINK_SAMPLES.map((s) => <span key={s.url} className="link-sample" onClick={() => run(s.url)}>{s.label}</span>)}
          </div>
        </>
      )}

      {mode === "loading" && (
        <div className="link-loading"><span className="sp"></span> 링크에서 장소 정보를 확인하고 있어요…</div>
      )}

      {mode === "error" && (
        <div style={{ padding: "12px 13px 13px" }}>
          <div className="state-error"><PIcon.x s={15} style={{ flex: "none", marginTop: 1 }}/> {err}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reset}>닫기</button>
            <button className="btn btn-pri" style={{ flex: 1 }} onClick={() => { setErr(""); setMode("input"); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); }}>다시 시도</button>
          </div>
        </div>
      )}

      {mode === "preview" && pv && (
        <div className="link-preview">
          <div className="lp-top">
            <div className="lp-thumb" style={{ background: `linear-gradient(140deg, ${P_CAT[cat].bg}, ${window.shade(P_CAT[cat].bg, -14)})` }}>{P_CAT[cat].emoji}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="lp-src"><PIcon.layers s={11}/> {pv.source.label}에서 가져옴</span>
              <div className="lp-name">{pv.name}</div>
              <div className="lp-addr"><PIcon.pin s={12} style={{ color: "var(--accent)" }}/> {pv.address}</div>
              <div className="lp-addr" style={{ marginTop: 2 }}><PIcon.clock s={12}/> {pv.meta} · {pv.dist}</div>
            </div>
          </div>
          <div className="lp-cat-label">카테고리 확인 (자동 분류 · 바꿀 수 있어요)</div>
          <div className="lp-cats">
            {LINK_CATS.map((k) => (
              <button key={k} className={"lp-cat" + (cat === k ? " on" : "")} onClick={() => setCat(k)}
                style={cat === k ? { background: P_CAT[k].bg } : {}}>
                <span>{P_CAT[k].emoji}</span> {P_CAT[k].label}
              </button>
            ))}
          </div>
          <div className="lp-acts">
            <button className="btn btn-ghost" onClick={reset}>취소</button>
            <button className="btn btn-pri" onClick={confirmAdd}><PIcon.plus s={15}/> 후보에 담기</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- 후보 탭 ---- */
function CandidateTab({ candidates, role, onToggleLike, onToggleDislike, onRemove, onFocusMap, onAddLink, onOpenDetail }) {
  return (
    <div>
      <LinkAdd onAdd={onAddLink}/>
      {candidates.length === 0 ? (
        <div className="empty" style={{ paddingTop: 24 }}>
          <span className="emoji"><PIcon.pin s={28}/></span>
          <div className="et">아직 담은 후보가 없어요</div>
          <div className="ed">봇에게 장소를 검색하거나, 위에서 <b>외부 링크</b>를 붙여넣어 후보를 담아보세요. 담긴 후보는 방 전체가 함께 봐요.</div>
          <div className="ex">예) <span className="k">@봇</span> 성산 근처 흑돼지 / <span className="k">/검색</span> 우도 카페</div>
        </div>
      ) : (
        <>
          <div className="cand-head" style={{ paddingTop: 6 }}>
            <div className="h"><PIcon.pin s={17} style={{ color: "var(--accent)" }}/> 후보 장소 <span style={{ color: "var(--ink-3)", fontWeight: 700 }}>{candidates.length}</span></div>
            <div className="sub">방 전체가 공유하는 방문 후보 풀이에요.</div>
          </div>
          <div className="cand-list">
            {candidates.map((c) => {
              const p = p_place(c.id);
              const meLike = c.likes.includes(P_ME);
              const meDislike = c.dislikes.includes(P_ME);
              return (
                <div className="cand" key={c.id}>
                  <button onClick={() => onOpenDetail(c.id)} style={{ cursor: "pointer", padding: 0, borderRadius: 10 }} title="상세 보기" aria-label={`${p.name} 상세 보기`}><P_Thumb cat={p.cat} size={42}/></button>
                  <div className="ci">
                    <button className="nm" onClick={() => onOpenDetail(c.id)} style={{ cursor: "pointer", textAlign: "left", padding: 0 }} title="상세 보기">{p.name}</button>
                    <div className="meta"><P_CatPill cat={p.cat}/><span>{p.dist}</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                      <button className={"react-btn like" + (meLike ? " on" : "")} onClick={() => onToggleLike(c.id)}>
                        {meLike ? <PIcon.heartFill s={13}/> : <PIcon.heart s={13}/>} {c.likes.length || ""}
                      </button>
                      {c.likes.length > 0 && (
                        <div className="liked-avas">{c.likes.slice(0, 3).map((id) => <Ava key={id} id={id}/>)}</div>
                      )}
                      <button className={"react-btn dislike" + (meDislike ? " on" : "")} style={{ marginLeft: "auto" }} onClick={() => onToggleDislike(c.id)} title="별로예요(집계만)">
                        <PIcon.thumbDown s={13}/> {c.dislikes.length || ""}
                      </button>
                    </div>
                  </div>
                  <div className="cand-acts" style={{ flexDirection: "column", alignSelf: "stretch", justifyContent: "space-between" }}>
                    <button className="icon-mini" title="상세 정보" onClick={() => onOpenDetail(c.id)}><PIcon.search s={15}/></button>
                    <button className="icon-mini" title="지도에서 보기" onClick={() => onFocusMap(c.id)}><PIcon.pin s={15}/></button>
                    <button className="icon-mini" title="후보에서 삭제" onClick={() => onRemove(c.id)}><PIcon.trash s={15}/></button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ---- 일정 탭 ---- */
function ItineraryTab({ itinerary, confirmed, role, selectedStop, onSelectStop, onConfirm }) {
  if (!itinerary) {
    return (
      <div className="empty">
        <span className="emoji"><PIcon.calendar s={28}/></span>
        <div className="et">아직 작업 중 일정이 없어요</div>
        <div className="ed">후보를 충분히 담은 뒤 봇에게 일정을 부탁하면, 동선과 숙소를 고려해 하나의 일정을 짜 줘요.</div>
        <div className="ex">예) <span className="k">@봇</span> 후보로 2박 3일 일정 짜줘 / <span className="k">/일정</span></div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="itin-head">
        <div className="row1">
          <span className="h">{itinerary.title.replace(" (작업본)", "")}</span>
          {confirmed
            ? <span className="status-dot confirmed"><PIcon.check s={13}/> 확정됨</span>
            : <span className="status-dot draft"><PIcon.edit s={12}/> 작업 중</span>}
        </div>
        <div className="relate">
          {confirmed
            ? <span>확정 일정이 고정돼 있어요. 작업본을 수정해도 다시 확정하기 전까지 확정 일정은 그대로예요.</span>
            : <span>방마다 작업 중 일정은 하나예요. 수정하면 이 일정이 바뀝니다.</span>}
        </div>
      </div>
      <div className="panel-body scroll" style={{ flex: 1 }}>
        <P_Timeline itinerary={itinerary} selectedStop={selectedStop} onSelectStop={onSelectStop} compact={true}/>
      </div>
      {role === "host" ? (
        <div className="confirm-bar host">
          <PIcon.crown s={16} style={{ color: "var(--coral)" }}/>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600, flex: 1 }}>방장 권한</span>
          <button className="btn btn-pri btn-sm" onClick={onConfirm}>
            <PIcon.flag s={14}/> {confirmed ? "다시 확정" : "일정 확정"}
          </button>
        </div>
      ) : (
        <div className="confirm-bar">
          <PIcon.user s={15} style={{ color: "var(--ink-3)" }}/>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>확정은 방장만 할 수 있어요. 수정 요청은 누구나 가능해요.</span>
        </div>
      )}
    </div>
  );
}

/* ---- 지도 탭 ---- */
function MapTab({ candidates, itinerary, selectedId, onSelect }) {
  const sel = selectedId ? p_place(selectedId) : null;
  return (
    <div className="map-wrap" style={{ height: "100%" }}>
      <window.MapView candidates={candidates} itinerary={itinerary} selectedId={selectedId} onSelect={onSelect}/>
      <div className="map-legend">
        <div className="lg"><span className="sw" style={{ background: P_CAT.sight.bg }}></span> 후보·일정 장소</div>
        <div className="lg"><span className="sw" style={{ background: P_CAT.lodging.bg }}></span> 숙소</div>
        <div className="lg"><span className="sw" style={{ background: "transparent", border: "2px dashed var(--accent)", borderRadius: 2 }}></span> 동선</div>
      </div>
      {sel && (
        <div className="map-pin-card" style={{ right: 12, top: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <P_Thumb cat={sel.cat} size={40}/>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "var(--ink)" }}>{sel.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{sel.meta}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 9, lineHeight: 1.5 }}>{sel.note}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 7, display: "flex", alignItems: "center", gap: 5 }}>
            <PIcon.pin s={13} style={{ color: "var(--accent)" }}/> {sel.dist}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- 패널 셸 ---- */
const TABS = [
  { id: "cand", label: "후보", icon: "pin" },
  { id: "itin", label: "일정", icon: "calendar" },
  { id: "map",  label: "지도", icon: "map" },
];
function SidePanel(props) {
  const { activeTab, setActiveTab, collapsed, setCollapsed, candidates, itinerary, tabStyle = "pill", side = "right", mobileOpen, onCloseSheet } = props;
  const counts = { cand: candidates.length, itin: itinerary ? itinerary.days.length : 0, map: "" };

  if (collapsed) {
    return (
      <div className="panel collapsed">
        <div className="panel-tabs" style={{ justifyContent: "center", padding: "10px 0" }}>
          <button className="collapse-btn" onClick={() => setCollapsed(false)} title="패널 펼치기" aria-label="패널 펼치기">
            {side === "right" ? <PIcon.chevL s={18}/> : <PIcon.chevR s={18}/>}
          </button>
        </div>
        <div className="panel-rail">
          {TABS.map((t) => {
            const Ico = PIcon[t.icon];
            return (
              <button key={t.id} className={"rail-btn" + (activeTab === t.id ? " on" : "")}
                      onClick={() => { setActiveTab(t.id); setCollapsed(false); }} title={t.label} aria-label={t.label}>
                <Ico s={19}/>
                {t.id === "cand" && candidates.length > 0 && <span className="badge-n">{candidates.length}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const TAB_TITLE = { cand: "후보 장소", itin: "작업 중 일정", map: "동선 지도" };
  return (
    <div className={"panel" + (mobileOpen ? " msheet-open" : "")} role="region" aria-label="여행 패널">
      <div className="sheet-grab">
        <span className="pill"></span>
        <button className="x" onClick={onCloseSheet} aria-label="시트 닫기"><PIcon.x s={16}/></button>
      </div>
      <div className={"panel-tabs " + tabStyle} role="tablist">
        {TABS.map((t) => {
          const Ico = PIcon[t.icon];
          return (
            <button key={t.id} role="tab" aria-selected={activeTab === t.id} className={"ptab" + (activeTab === t.id ? " on" : "")} onClick={() => setActiveTab(t.id)}>
              <Ico s={16}/> {t.label}
              {counts[t.id] !== "" && counts[t.id] > 0 && <span className="count">{counts[t.id]}</span>}
            </button>
          );
        })}
        <button className="collapse-btn" onClick={() => setCollapsed(true)} title="패널 접기" aria-label="패널 접기">
          {side === "right" ? <PIcon.chevR s={18}/> : <PIcon.chevL s={18}/>}
        </button>
      </div>
      <div className="panel-body scroll" style={{ display: activeTab === "map" ? "flex" : "block" }}>
        {activeTab === "cand" && <CandidateTab {...props}/>}
        {activeTab === "itin" && <ItineraryTab {...props} confirmed={props.confirmed}/>}
        {activeTab === "map" && <MapTab {...props}/>}
      </div>
    </div>
  );
}

window.SidePanel = SidePanel;
