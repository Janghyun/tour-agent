/* lobby.jsx — 방 밖 진입 화면(ESM): 내 이름 정하기 · 내 방 목록 · 새 방 만들기 · 방 코드로 입장.
 * 디자인 프로토타입에서 포팅하되, 백엔드(방 목록 API 없음, 방 코드 기반)에 맞게 간소화했다.
 * 방 목록은 localStorage(rooms.js) 기반 재입장 바로가기다. */
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { loadAdminKey } from "./rooms.js";

const ROOM_EMOJIS = ["🌋", "🏝️", "🌊", "⛰️", "🏖️", "🌃", "🚙", "⛵"];

function avaColor(name = "") {
  const colors = ["#1F8A5B", "#FF7A59", "#2F86C7", "#9B6FE0", "#E0567B", "#E8962F"];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

export function LobbyScreen({ me, onMe, rooms, onEnter, onNew, onJoin, onForget }) {
  return (
    <div className="lobby scroll">
      <div className="lobby-top">
        <div className="brand"><span className="mark"><Icon.map s={17} /></span><span>여행봇</span></div>
        <div className="spacer" style={{ flex: 1 }}></div>
        <div className="me">
          <span style={{ color: "var(--ink-3)", fontWeight: 600 }}>내 이름</span>
          <span className="av" style={{ background: avaColor(me) }}>{(me || "?")[0]}</span>
        </div>
      </div>

      <div className="lobby-wrap">
        <div className="lobby-hi">
          <h1>안녕하세요{me ? `, ${me}님` : ""} 👋</h1>
          <p>먼저 이름을 정하고, 함께 떠날 여행 방을 만들거나 코드로 입장하세요.</p>
        </div>

        <div className="field" style={{ marginBottom: 22, maxWidth: 320 }}>
          <label>내 이름 <span className="req">*</span></label>
          <input value={me} onChange={(e) => onMe(e.target.value)} placeholder="예) 민수, 영희" maxLength={12} />
        </div>

        <div className="lobby-actions">
          <button className="lobby-action primary" onClick={onNew} disabled={!me.trim()} style={{ opacity: me.trim() ? 1 : 0.5 }}>
            <span className="ai"><Icon.plus s={24} /></span>
            <span><div className="at">새 여행 방 만들기</div><div className="as">여행지·기간을 정하고 친구를 초대해요</div></span>
          </button>
          <button className="lobby-action ghost" onClick={onJoin} disabled={!me.trim()} style={{ opacity: me.trim() ? 1 : 0.5 }}>
            <span className="ai"><Icon.send s={20} /></span>
            <span><div className="at">방 코드로 입장</div><div className="as">받은 코드로 바로 참여</div></span>
          </button>
        </div>

        <div className="lobby-sec-head">
          <span className="t">내 방</span><span className="n">{rooms.length}</span>
        </div>
        {rooms.length === 0 && (
          <div className="empty" style={{ padding: "10px 2px", color: "var(--ink-3)", fontSize: 13.5 }}>
            아직 방이 없어요. 위에서 새 방을 만들어 시작해 보세요.
          </div>
        )}
        <div className="room-list">
          {rooms.map((r) => (
            <div className="room-card" key={r.id} role="button" tabIndex={0}
                 onClick={() => onEnter(r)}
                 onKeyDown={(e) => { if (e.key === "Enter") onEnter(r); }}>
              <div className="room-cover" style={{ background: `linear-gradient(150deg, var(--accent-50), var(--bg-2))` }}>{r.emoji || "🗺️"}</div>
              <div className="room-main">
                <div className="room-r1">
                  <span className="room-dest">{r.dest || r.id}</span>
                  {r.role === "host" && <span className="room-host-badge">내가 방장</span>}
                </div>
                <div className="room-r2">
                  <span><Icon.calendar s={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />{r.dates || "기간 미정"}</span>
                  <span className="dot"></span>
                  <span className="room-base"><Icon.pin s={12} /> {r.base || "거점 미정"}</span>
                </div>
                <div className="room-last">코드 {r.id}</div>
              </div>
              <div className="room-side">
                <button className="icon-mini" title="목록에서 제거"
                        onClick={(e) => { e.stopPropagation(); onForget(r.id); }}
                        style={{ border: "none", background: "transparent", color: "var(--ink-4)", cursor: "pointer" }}>
                  <Icon.trash s={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function fmtDate(s) { if (!s) return ""; const [, m, d] = s.split("-"); return `${+m}.${+d}`; }

export function CreateRoomModal({ onClose, onCreate }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const [emoji, setEmoji] = useState("🌋");
  const [name, setName] = useState("");
  const [dest, setDest] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [base, setBase] = useState("");
  const [adminKey, setAdminKey] = useState(() => loadAdminKey());
  const canCreate = name.trim().length > 0;

  const create = () => {
    if (!canCreate) return;
    const dates = start && end ? `${fmtDate(start)}–${fmtDate(end)}` : "기간 미정";
    onCreate({ emoji, dest: name.trim(), destination: dest.trim() || name.trim(), dates, base: base.trim(), adminKey: adminKey.trim() });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-title-bar">
          <span className="mt">새 여행 방 만들기</span>
          <button className="x" onClick={onClose}><Icon.x s={16} /></button>
        </div>
        <div className="modal-body scroll" style={{ gap: 0 }}>
          <div className="form-grid">
            <div className="field">
              <label>커버</label>
              <div className="emoji-pick">
                {ROOM_EMOJIS.map((e) => <button key={e} className={"emoji-opt" + (emoji === e ? " on" : "")} onClick={() => setEmoji(e)}>{e}</button>)}
              </div>
            </div>
            <div className="field">
              <label>여행 이름 <span className="req">*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 제주 2박 3일, 친구들과 부산" />
            </div>
            <div className="field">
              <label>여행지</label>
              <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="예) 제주, 부산, 통영" />
            </div>
            <div className="field">
              <label>기간</label>
              <div className="field-row">
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>거점 / 숙소 지역 <span style={{ color: "var(--ink-4)", fontWeight: 500 }}>(선택)</span></label>
              <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="예) 성산 거점, 해운대 거점" />
            </div>
            <div className="field">
              <label>관리자 키 <span style={{ color: "var(--ink-4)", fontWeight: 500 }}>(방 생성 권한)</span></label>
              <input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)}
                     placeholder="배포 서버에 설정한 ADMIN_KEY" autoComplete="off" />
              <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 4 }}>
                공개 배포 시 방 생성엔 관리자 키가 필요해요(로컬은 비워도 됩니다). 입력하면 이 기기에 저장돼요.
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-pri" onClick={create} style={{ opacity: canCreate ? 1 : 0.5 }}>
            <Icon.plus s={16} /> 방 만들고 입장
          </button>
        </div>
      </div>
    </div>
  );
}

export function JoinRoomModal({ onClose, onJoin }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState("");
  const ref = useRef(null);
  const can = code.trim().length > 0;
  const join = () => { if (can) onJoin(code.trim().toUpperCase(), invite.trim()); };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <div className="modal-title-bar">
          <span className="mt">방 코드로 입장</span>
          <button className="x" onClick={onClose}><Icon.x s={16} /></button>
        </div>
        <div style={{ padding: "16px 18px" }}>
          <div className="field">
            <label>방 코드</label>
            <input ref={ref} value={code} onChange={(e) => setCode(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter") join(); }}
                   placeholder="예) JEJU9X 또는 친구가 보낸 코드" autoFocus />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>초대 코드 <span style={{ color: "var(--ink-4)", fontWeight: 500 }}>(받았다면)</span></label>
            <input value={invite} onChange={(e) => setInvite(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter") join(); }}
                   placeholder="초대 링크를 받았으면 링크로 바로 입장하세요" autoComplete="off" />
          </div>
          <div className="join-invited" style={{ marginTop: 14 }}>
            <Icon.user s={15} /> 여행자로 참여합니다. 공개 배포된 방은 초대 코드(또는 초대 링크)가 필요해요.
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-pri" onClick={join} style={{ opacity: can ? 1 : 0.5 }}>
            <Icon.send s={15} /> 이 방에 참여하기
          </button>
        </div>
      </div>
    </div>
  );
}
