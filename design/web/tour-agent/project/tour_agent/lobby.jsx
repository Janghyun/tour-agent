/* lobby.jsx — 방 밖 진입 화면: 내 방 목록 · 새 방 만들기 · 초대 링크 입장 · 방 전환기 */
const { MEMBERS: L_MEM, ME: L_ME } = window.TA_DATA;
const LIcon = window.Icon;
const { useState: lUS, useRef: lUR } = React;

function RoomAva({ id, size = 26, cls = "rm" }) {
  const m = L_MEM[id];
  if (!m) return <span className={cls} style={{ width: size, height: size, background: "var(--ink-4)" }}>?</span>;
  return <span className={cls} style={{ width: size, height: size, background: m.color }} title={m.name}>{m.name[0]}</span>;
}

function StatusPill({ confirmed }) {
  return confirmed
    ? <span className="status-dot confirmed"><LIcon.check s={12}/> 확정됨</span>
    : <span className="status-dot draft"><LIcon.edit s={11}/> 작업 중</span>;
}

/* ===== 로비 ===== */
function LobbyScreen({ rooms, onEnter, onNew, onJoin }) {
  const me = L_MEM[L_ME];
  return (
    <div className="lobby scroll">
      <div className="lobby-top">
        <div className="brand"><span className="mark"><LIcon.map s={17}/></span><span>여행봇</span></div>
        <div className="spacer"></div>
        <div className="me"><span style={{ color: "var(--ink-3)", fontWeight: 600 }}>내 계정</span><span className="av" style={{ background: me.color }}>{me.name[0]}</span></div>
      </div>

      <div className="lobby-wrap">
        <div className="lobby-hi">
          <h1>안녕하세요, {me.name}님 👋</h1>
          <p>함께 떠날 여행 방을 고르거나, 새로 시작해 보세요.</p>
        </div>

        <div className="lobby-actions">
          <button className="lobby-action primary" onClick={onNew}>
            <span className="ai"><LIcon.plus s={24}/></span>
            <span><div className="at">새 여행 방 만들기</div><div className="as">여행지·기간을 정하고 친구를 초대해요</div></span>
          </button>
          <button className="lobby-action ghost" onClick={onJoin}>
            <span className="ai"><LIcon.send s={20}/></span>
            <span><div className="at">초대 링크로 입장</div><div className="as">받은 링크로 바로 참여</div></span>
          </button>
        </div>

        <div className="lobby-sec-head">
          <span className="t">내 방</span><span className="n">{rooms.length}</span>
        </div>
        <div className="room-list">
          {rooms.map((r) => (
            <button className="room-card" key={r.id} onClick={() => onEnter(r.id)}>
              <div className="room-cover" style={{ background: `linear-gradient(150deg, ${r.tint || "var(--accent-50)"}, ${r.tint2 || "var(--bg-2)"})` }}>{r.emoji}</div>
              <div className="room-main">
                <div className="room-r1">
                  <span className="room-dest">{r.dest}</span>
                  {r.host === L_ME && <span className="room-host-badge">내가 방장</span>}
                </div>
                <div className="room-r2">
                  <span><LIcon.calendar s={13} style={{ verticalAlign: "-2px", marginRight: 3 }}/>{r.dates}</span>
                  <span className="dot"></span>
                  <span className="room-base"><LIcon.pin s={12}/>{r.base}</span>
                </div>
                <div className="room-last">{r.last}</div>
              </div>
              <div className="room-side">
                <StatusPill confirmed={r.confirmed}/>
                <div className="room-members">
                  {r.members.slice(0, 4).map((id) => <RoomAva key={id} id={id}/>)}
                  {r.members.length > 4 && <span className="rm" style={{ background: "var(--bg-2)", color: "var(--ink-2)" }}>+{r.members.length - 4}</span>}
                </div>
                <span className="room-time">{r.lastTime}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===== 새 방 만들기 ===== */
const ROOM_EMOJIS = ["🌋", "🏝️", "🌊", "⛰️", "🏖️", "🌃", "🚙", "⛵"];
function fmtDate(s) { if (!s) return ""; const [y, m, d] = s.split("-"); return `${+m}.${+d}`; }
function dow(s) { if (!s) return ""; const days = ["일","월","화","수","목","금","토"]; return days[new Date(s).getDay()]; }

function CreateRoomModal({ onClose, onCreate }) {
  React.useEffect(() => { const h = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  const [emoji, setEmoji] = lUS("🌋");
  const [name, setName] = lUS("");
  const [dest, setDest] = lUS("");
  const [start, setStart] = lUS("");
  const [end, setEnd] = lUS("");
  const [base, setBase] = lUS("");
  const canCreate = name.trim().length > 0;

  const create = () => {
    if (!canCreate) return;
    const dates = start && end ? `${fmtDate(start)}(${dow(start)})–${fmtDate(end)}(${dow(end)})` : "기간 미정";
    onCreate({
      id: "room-" + Date.now(), emoji, dest: name.trim(),
      dates, base: base.trim() || "거점 미정",
      members: [L_ME], host: L_ME, role: "host", confirmed: false,
      last: "새 방을 만들었어요 — 친구를 초대해 보세요", lastTime: "방금", fresh: true,
      tint: "var(--accent-50)", tint2: "var(--bg-2)",
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-title-bar">
          <span className="mt">새 여행 방 만들기</span>
          <button className="x" onClick={onClose}><LIcon.x s={16}/></button>
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
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예) 제주 2박 3일, 친구들과 부산"/>
            </div>
            <div className="field">
              <label>여행지</label>
              <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="예) 제주, 부산, 통영"/>
            </div>
            <div className="field">
              <label>기간</label>
              <div className="field-row">
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)}/>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}/>
              </div>
            </div>
            <div className="field">
              <label>거점 / 숙소 지역 <span style={{ color: "var(--ink-4)", fontWeight: 500 }}>(선택)</span></label>
              <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="예) 성산 거점, 해운대 거점"/>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-pri" onClick={create} style={{ opacity: canCreate ? 1 : .5 }}>
            <LIcon.plus s={16}/> 방 만들고 입장
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===== 초대 링크 입장 ===== */
function JoinRoomModal({ onClose, onJoin }) {
  React.useEffect(() => { const h = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, []);
  const [mode, setMode] = lUS("input"); // input | loading | preview
  const [link, setLink] = lUS("");
  const [preview, setPreview] = lUS(null);
  const inputRef = lUR(null);

  const check = (override) => {
    const v = (override != null ? override : link).trim();
    if (!v) return;
    setLink(v); setMode("loading");
    setTimeout(() => {
      setPreview({
        id: "joined-" + Date.now(), emoji: "🏝️", dest: "영희님의 제주 워케이션",
        dates: "9.20(토)–9.23(화)", base: "애월 거점",
        host: "younghee", members: ["younghee", "junho", "jieun"],
        role: "traveler", confirmed: false,
        last: "영희: 어서 와! 후보부터 같이 담자", lastTime: "방금",
        tint: "#E3F0FA", tint2: "var(--bg-2)",
      });
      setMode("preview");
    }, 800);
  };

  const join = () => {
    const r = { ...preview, members: [...preview.members, L_ME], fresh: true, last: "내가 방에 참여했어요 👋" };
    onJoin(r);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <div className="modal-title-bar">
          <span className="mt">초대 링크로 입장</span>
          <button className="x" onClick={onClose}><LIcon.x s={16}/></button>
        </div>

        {mode !== "preview" && (
          <div style={{ padding: "16px 18px" }}>
            <div className="field">
              <label>초대 링크</label>
              <input ref={inputRef} value={link} onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") check(); }}
                placeholder="https://tourbot.app/invite/…"/>
            </div>
            <div className="link-hint" style={{ padding: "10px 0 0" }}>
              예시로 입장: <span className="link-sample" onClick={() => check("https://tourbot.app/invite/JEJU-9X2A")}>tourbot.app/invite/JEJU-9X2A</span>
            </div>
            {mode === "loading" && <div className="link-loading" style={{ padding: "14px 0 0" }}><span className="sp"></span> 초대 링크를 확인하고 있어요…</div>}
          </div>
        )}

        {mode === "preview" && preview && (
          <>
            <div className="join-preview">
              <div className="join-card">
                <div className="jc-cover" style={{ background: `linear-gradient(150deg, ${preview.tint}, var(--bg-2))` }}>{preview.emoji}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>{preview.dest}</div>
                  <div className="join-meta-row">
                    <span><LIcon.calendar s={13} style={{ verticalAlign: "-2px", marginRight: 3 }}/>{preview.dates}</span>
                    <span className="dot" style={{ width: 3, height: 3, borderRadius: 9, background: "var(--ink-4)" }}></span>
                    <span><LIcon.pin s={12}/> {preview.base}</span>
                  </div>
                  <div className="join-meta-row">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><LIcon.crown s={13} style={{ color: "var(--coral)" }}/> 방장 {L_MEM[preview.host].name}</span>
                    <div className="room-members" style={{ marginLeft: 2 }}>{preview.members.map((id) => <RoomAva key={id} id={id} size={22}/>)}</div>
                    <span>여행자 {preview.members.length}명</span>
                  </div>
                </div>
              </div>
              <div className="join-invited"><LIcon.user s={15}/> 여행자로 참여합니다. 일정 확정은 방장만 할 수 있어요.</div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => { setMode("input"); setPreview(null); }}>다른 링크</button>
              <button className="btn btn-pri" onClick={join}><LIcon.send s={15}/> 이 방에 참여하기</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ===== 방 전환기 (방 안 상단바) ===== */
function RoomSwitcher({ rooms, activeId, active, onSwitch, onLobby, onNew, onInvite, isHost }) {
  const [open, setOpen] = lUS(false);
  return (
    <div className="room-switch">
      <button className="room-switch-btn" onClick={() => setOpen((o) => !o)} aria-label="방 전환 메뉴">
        <span className="mark" style={{ width: 30, height: 30, borderRadius: 9, fontSize: 16, background: `linear-gradient(150deg, ${active.tint || "var(--accent-50)"}, var(--bg-2))`, display: "grid", placeItems: "center" }}>{active.emoji}</span>
        <LIcon.chevD s={16} style={{ color: "var(--ink-3)" }}/>
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 55 }} onClick={() => setOpen(false)}></div>
          <div className="room-switch-menu">
            <div className="rsw-head">방 전환</div>
            {rooms.map((r) => (
              <div key={r.id} className={"rsw-item" + (r.id === activeId ? " on" : "")} onClick={() => { onSwitch(r.id); setOpen(false); }}>
                <span className="e" style={{ background: `linear-gradient(150deg, ${r.tint || "var(--accent-50)"}, var(--bg-2))` }}>{r.emoji}</span>
                <span className="ii"><div className="d">{r.dest}</div><div className="s">{r.dates} · 여행자 {r.members.length}</div></span>
                {r.id === activeId && <LIcon.check s={16} style={{ color: "var(--accent)" }}/>}
              </div>
            ))}
            <div className="rsw-divider"></div>
            <div className="rsw-foot">
              {isHost && onInvite && <button onClick={() => { onInvite(); setOpen(false); }}><LIcon.send s={16}/> 초대 링크 복사</button>}
              <button onClick={() => { onNew(); setOpen(false); }}><LIcon.plus s={16}/> 새 여행 방 만들기</button>
              <button onClick={() => { onLobby(); setOpen(false); }}><LIcon.list s={16}/> 내 방 목록으로</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

Object.assign(window, { LobbyScreen, CreateRoomModal, JoinRoomModal, RoomSwitcher });
