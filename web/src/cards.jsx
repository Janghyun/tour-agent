/* 봇 카드 컴포넌트 — 디자인 프로토타입에서 포팅, 백엔드 present_* 페이로드로 구동.
 * styles.css의 .card/.place-row/.tl 등 디자인 클래스를 사용. 카테고리는 catKey로 정규화. */
import { Icon } from "./icons.jsx";
import { CAT, catKey, shade } from "./constants.js";

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
              <Thumb cat={k} />
              <div className="place-info">
                <div className="nm">{o.name} <CatPill cat={k} /></div>
                <div className="meta">
                  <span>{o.category || CAT[k].label}</span>
                  {o.address && <><span className="dot"></span><span>{o.address}</span></>}
                  {o.distance_m != null && <><span className="dot"></span><span>{o.distance_m}m</span></>}
                </div>
              </div>
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
        <span className="note"><b>추가</b>를 누르면 후보에 담겨 방 전체에 공유돼요. 영업시간은 확인 필요.</span>
      </div>
    </div>
  );
}

export function ItineraryCard({ card, confirmed }) {
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
            <div className="tl-track">
              {(d.items || []).map((it, ii) => (
                <div className="tl-stop" key={ii}>
                  <div className="node"><i></i></div>
                  <div className="tl-card">
                    <span className="tl-time">{it.time || ""}</span>
                    <div className="tl-body">
                      <div className="nm">{it.name} {it.category && <CatPill cat={catKey(it.category)} />}</div>
                      {it.travel_from_prev && <div className="sub">{it.travel_from_prev}</div>}
                    </div>
                  </div>
                </div>
              ))}
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
