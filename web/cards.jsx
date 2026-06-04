/* cards.jsx — 봇 카드 4종 + 작업중/타임라인 공용 */
const { CAT: C_CAT, place: c_place, MEMBERS: C_MEM } = window.TA_DATA;
const CIcon = window.Icon;

/* 썸네일 */
function Thumb({ cat, size = 52, radius }) {
  const c = C_CAT[cat];
  return (
    <div style={{
      width: size, height: size, borderRadius: radius || (size > 44 ? 12 : 9),
      display: "grid", placeItems: "center", flex: "none", fontSize: size * 0.42,
      background: `linear-gradient(140deg, ${c.bg}, ${shade(c.bg, -14)})`,
      boxShadow: `0 4px 10px ${c.bg}38`,
    }}>{c.emoji}</div>
  );
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function CatPill({ cat }) {
  const c = C_CAT[cat];
  return <span className="cat-pill" style={{ background: c.pill, color: c.pinkText }}>{c.label}</span>;
}

/* ====== 카드1: 장소 옵션 ====== */
function PlaceOptionsCard({ payload, addedIds, onAdd, onSetLodging, onFocusMap }) {
  const tagColor = payload.tag === "추천"
    ? { background: "var(--accent-50)", color: "var(--accent-700)" }
    : { background: "#E3F0FA", color: "#1E6BA8" };
  return (
    <div className="card pop-in">
      <div className="card-head">
        <div className="ico" style={{ background: "var(--accent-50)", color: "var(--accent)" }}><CIcon.search s={17}/></div>
        <div>
          <div className="t">{payload.title}</div>
          <div className="s">{payload.subtitle}</div>
        </div>
        <div className="grow"></div>
        <span className="card-tag" style={tagColor}>{payload.tag}</span>
      </div>
      <div className="place-list">
        {payload.items.map((id) => {
          const p = c_place(id); const added = addedIds.has(id);
          return (
            <div className="place-row" key={id}>
              <Thumb cat={p.cat}/>
              <div className="place-info">
                <div className="nm">{p.name} <CatPill cat={p.cat}/></div>
                <div className="meta"><span>{p.meta}</span><span className="dot"></span><span>{p.dist}</span></div>
              </div>
              <div className="place-actions">
                <button className="icon-mini tip" title="지도에서 보기" onClick={() => onFocusMap(id)}><CIcon.pin s={16}/></button>
                <button className="btn btn-ghost btn-sm tip" title="이 박의 숙소로 지정" onClick={() => onSetLodging(id)}><CIcon.bed s={15}/> 숙소</button>
                {added ? (
                  <span className="btn btn-added btn-sm"><CIcon.check s={15}/> 담음</span>
                ) : (
                  <button className="btn btn-pri btn-sm" onClick={() => onAdd(id)}><CIcon.plus s={15}/> 추가</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="card-foot">
        <CIcon.sparkle s={15} style={{ color: "var(--accent)" }}/>
        <span className="note"><b>추가</b>를 누르면 <b>후보 탭</b>에 담겨 방 전체에 공유돼요. 봇이 임의로 담지 않아요.</span>
      </div>
    </div>
  );
}

/* ====== 공용: 타임라인 본문 (카드 + 패널 공유) ====== */
function Timeline({ itinerary, selectedStop, onSelectStop, compact = false }) {
  const moveIcon = (mode) => mode === "walk" ? <CIcon.walk s={13}/> : mode === "bus" ? <CIcon.bus s={13}/> : <CIcon.car s={13}/>;
  const moveLabel = (mode) => mode === "walk" ? "도보" : mode === "bus" ? "버스" : "차량";
  return (
    <div className="tl">
      {itinerary.days.map((day, di) => (
        <div className="tl-day" key={di}>
          <div className="tl-day-head">
            <span className="badge">{di + 1}</span>
            <span className="dl">{day.label}</span>
            <span className="ds">· {day.date}</span>
          </div>
          {/* 박별 숙소 */}
          <div className="tl-track">
            {(() => {
              const lp = c_place(day.lodging);
              return (
                <div className="tl-stop lodging">
                  <div className="node"><i></i></div>
                  <button type="button" className={"tl-card lodging" + (selectedStop === day.lodging ? " sel" : "")} onClick={() => onSelectStop(day.lodging)} style={{ width: "100%", textAlign: "left" }}>
                    <span className="tl-time"><CIcon.bed s={15}/></span>
                    <div className="tl-body">
                      <div className="nm">{lp.name}</div>
                      <div className="sub">{day.label} 숙소 · {lp.meta}</div>
                    </div>
                    <Thumb cat="lodging" size={34}/>
                  </button>
                </div>
              );
            })()}
            {day.stops.map((s, si) => {
              if (s.move) {
                return (
                  <div className="tl-move" key={si}>
                    <span className="ln"></span>
                    <span className="pill">{moveIcon(s.move.mode)} {moveLabel(s.move.mode)} {s.move.mins}분</span>
                  </div>
                );
              }
              const p = c_place(s.id);
              return (
                <div className="tl-stop" key={si}>
                  <div className="node"><i></i></div>
                  <button type="button" className={"tl-card" + (selectedStop === s.id ? " sel" : "")} onClick={() => onSelectStop(s.id)} style={{ width: "100%", textAlign: "left" }}>
                    <span className="tl-time">{s.time}</span>
                    <div className="tl-body">
                      <div className="nm">{p.name} <CatPill cat={p.cat}/></div>
                      <div className="sub">{s.dur} · {p.meta}</div>
                    </div>
                    {!compact && <Thumb cat={p.cat} size={34}/>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ====== 카드2: 일정 타임라인 ====== */
function ItineraryCard({ itinerary, role, confirmed, selectedStop, onSelectStop, onConfirm, onModify }) {
  return (
    <div className="card pop-in">
      <div className="card-head">
        <div className="ico" style={{ background: "var(--accent-50)", color: "var(--accent)" }}><CIcon.calendar s={17}/></div>
        <div>
          <div className="t">{itinerary.title}</div>
          <div className="s">{itinerary.days.length}일 · 동선·숙소 반영 완료</div>
        </div>
        <div className="grow"></div>
        {confirmed
          ? <span className="status-dot confirmed"><CIcon.check s={13}/> 확정됨</span>
          : <span className="status-dot draft"><CIcon.edit s={12}/> 작업 중</span>}
      </div>
      <Timeline itinerary={itinerary} selectedStop={selectedStop} onSelectStop={onSelectStop}/>
      <div className="card-foot" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-ghost btn-sm" onClick={onModify}><CIcon.edit s={14}/> 수정 요청</button>
        {role === "host"
          ? <button className="btn btn-pri btn-sm" onClick={onConfirm}><CIcon.flag s={14}/> 이 일정 확정</button>
          : <span className="note" style={{ display:"inline-flex", alignItems:"center", gap:6 }}><CIcon.crown s={13} style={{color:"var(--coral)"}}/> 확정은 방장만 할 수 있어요</span>}
      </div>
    </div>
  );
}

/* ====== 카드3: 옵션 비교 ====== */
function CompareCard({ payload, onPick }) {
  return (
    <div className="card pop-in">
      <div className="card-head">
        <div className="ico" style={{ background: "#F0E9FB", color: "#9B6FE0" }}><CIcon.layers s={17}/></div>
        <div>
          <div className="t">{payload.title}</div>
          <div className="s">{payload.subtitle}</div>
        </div>
        <div className="grow"></div>
        <span className="card-tag" style={{ background:"#F0E9FB", color:"#6E47B8" }}>비교</span>
      </div>
      <div className="compare-grid">
        {payload.items.map((id) => {
          const p = c_place(id);
          return (
            <button type="button" className="compare-opt" key={id} onClick={() => onPick(id)} style={{ textAlign: "left" }}>
              <div className="cthumb" style={{ background:`linear-gradient(140deg, ${C_CAT[p.cat].bg}, ${shade(C_CAT[p.cat].bg,-14)})` }}>{C_CAT[p.cat].emoji}</div>
              <div className="cnm">{p.name}</div>
              <div className="cmeta">{p.meta}<br/>{p.dist}</div>
              <span className="btn btn-soft btn-sm pick"><CIcon.check s={14}/> 이걸로</span>
            </button>
          );
        })}
      </div>
      <div className="card-foot">
        <CIcon.sparkle s={15} style={{ color: "#9B6FE0" }}/>
        <span className="note">하나를 고르면 <b>{payload.slot}</b> 슬롯에 반영돼요.</span>
      </div>
    </div>
  );
}

/* ====== 카드4: 지도 ====== */
function MapCard({ candidates, itinerary, selectedId, onSelect }) {
  return (
    <div className="card pop-in">
      <div className="card-head">
        <div className="ico" style={{ background: "#E3F0FA", color: "#2F86C7" }}><CIcon.map s={17}/></div>
        <div>
          <div className="t">동선 지도</div>
          <div className="s">후보·일정·숙소 핀 + 일자별 동선</div>
        </div>
        <div className="grow"></div>
        <span className="card-tag" style={{ background:"#E3F0FA", color:"#1E6BA8" }}>지도</span>
      </div>
      <div className="map-in-card">
        <window.MapView candidates={candidates} itinerary={itinerary} selectedId={selectedId} onSelect={onSelect}/>
      </div>
    </div>
  );
}

/* ====== 작업 중 카드 ====== */
const WORK_STEPS = ["일정 설계", "동선 계산", "검증"];
function WorkingCard({ step, onCancel }) {
  return (
    <div className="card pop-in" style={{ borderColor: "var(--accent-100)" }}>
      <div className="working">
        <div className="working-head">
          <div className="spinner"></div>
          <div>
            <div className="wt">일정을 짜고 있어요…</div>
            <div className="ws">1~2분 걸릴 수 있어요. 그동안 자유롭게 대화하세요.</div>
          </div>
        </div>
        <div className="working-steps">
          {WORK_STEPS.map((label, i) => (
            <div key={i} className={"wstep " + (i < step ? "done" : i === step ? "active" : "")}>
              <span className="dotn">{i < step ? <CIcon.check s={13}/> : <i></i>}</span>
              <span className="wl">{label}</span>
            </div>
          ))}
        </div>
        <div className="working-foot">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}><CIcon.cancel s={15}/> 작업 취소</button>
          <span className="note" style={{ fontSize: 12, color: "var(--ink-3)" }}>취소하면 진행 중인 설계가 폐기돼요.</span>
        </div>
      </div>
    </div>
  );
}

/* ====== 장소 상세 팝업 (위치정보 제외 · 외부 링크로 확인) ====== */
function PlaceDetailModal({ place, cand, onClose }) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  if (!place) return null;
  const c = C_CAT[place.cat];
  const q = encodeURIComponent(place.name + " 제주");
  const links = [
    { id: "kakao",  name: "카카오맵에서 보기", sub: "지도·리뷰·영업정보", logo: "K", bg: "#FEE500", fg: "#3A1D1D", url: `https://map.kakao.com/?q=${encodeURIComponent(place.name)}` },
    { id: "naver",  name: "네이버에서 보기",   sub: "플레이스·예약·메뉴", logo: "N", bg: "#03C75A", fg: "#fff", url: `https://map.naver.com/p/search/${encodeURIComponent(place.name)}` },
    { id: "google", name: "구글에서 보기",     sub: "리뷰·사진·평점",     logo: "G", bg: "#fff", fg: "#4285F4", border: true, url: `https://www.google.com/search?q=${q}` },
  ];
  const likers = cand ? cand.likes : [];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hero" style={{ background: `linear-gradient(135deg, ${c.bg}, ${shade(c.bg, -22)})` }}>
          <span className="glyph">{c.emoji}</span>
          <button className="close" onClick={onClose}><CIcon.x s={16}/></button>
          <div className="h-info">
            <span className="h-cat" style={{ color: c.pinkText }}>{c.emoji} {c.label}</span>
            <div className="h-name">{place.name}</div>
            <div className="h-meta">{place.meta}</div>
          </div>
        </div>
        <div className="modal-body scroll">
          <div>
            <div className="md-sect-label">소개</div>
            <div className="md-desc">{place.note}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12, color: "var(--ink-3)", fontWeight: 600 }}>
              <CIcon.clock s={14}/> 영업시간·가격은 자주 바뀌어요
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#9A6411", background: "var(--amber-50)", padding: "1px 7px", borderRadius: 99, border: "1px solid #F2DDB6" }}>확인 필요</span>
            </div>
          </div>

          {cand && (
            <div>
              <div className="md-sect-label">방 반응</div>
              <div className="md-reactions">
                <div className="md-react-stat like"><span className="ic"><CIcon.heartFill s={14}/></span> 좋아요 {likers.length}</div>
                <div className="md-react-stat dislike"><span className="ic"><CIcon.thumbDown s={13}/></span> {cand.dislikes.length}</div>
                {likers.length > 0 && (
                  <div className="md-likers">{likers.slice(0, 4).map((id) => (
                    <span key={id} className="la" style={{ background: C_MEM[id].color }} title={C_MEM[id].name}>{C_MEM[id].name[0]}</span>
                  ))}</div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="md-sect-label">외부에서 더 알아보기</div>
            <div className="md-links">
              {links.map((l) => (
                <a key={l.id} className="md-link" href={l.url} target="_blank" rel="noopener noreferrer">
                  <span className="logo" style={{ background: l.bg, color: l.fg, border: l.border ? "1.5px solid var(--line)" : "none" }}>{l.logo}</span>
                  <span className="lt"><div className="l1">{l.name}</div><div className="l2">{l.sub}</div></span>
                  <CIcon.arrowUp s={16} className="go" style={{ transform: "rotate(45deg)" }}/>
                </a>
              ))}
            </div>
          </div>
          <div className="md-note">영업시간·메뉴·실시간 리뷰는 외부 서비스에서 가장 정확해요. 위치·동선은 <b>지도 탭</b>에서 확인하세요.</div>
        </div>
      </div>
    </div>
  );
}

/* ====== 검색 0건 (빈 결과) ====== */
function NoResultCard({ q }) {
  return (
    <div className="card pop-in">
      <div className="card-head">
        <div className="ico" style={{ background: "var(--bg-2)", color: "var(--ink-3)" }}><CIcon.search s={17}/></div>
        <div>
          <div className="t">검색 결과가 없어요</div>
          <div className="s">{q ? `‘${q.replace(/^@봇\s*|^\/검색\s*/, "")}’에 맞는 곳을 찾지 못했어요` : "조건에 맞는 곳을 찾지 못했어요"}</div>
        </div>
      </div>
      <div className="noresult">
        <span className="ic"><CIcon.search s={22}/></span>
        <div className="t">다른 키워드로 다시 찾아볼까요?</div>
        <div className="d">제주 성산 권역 기준으로 ‘흑돼지·해장국·전복·카페·명소’ 같은 키워드가 잘 잡혀요. 지역이나 메뉴를 조금 더 구체적으로 적어 주세요.</div>
      </div>
    </div>
  );
}

Object.assign(window, { Thumb, CatPill, PlaceOptionsCard, Timeline, ItineraryCard, CompareCard, MapCard, WorkingCard, PlaceDetailModal, NoResultCard, shade });
