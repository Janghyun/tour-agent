/* chat.jsx — 채팅 메시지 목록 + 컴포저 */
const { MEMBERS: CH_MEM, ME: CH_ME, SLASH: CH_SLASH } = window.TA_DATA;
const ChIcon = window.Icon;
const { useState, useRef, useEffect } = React;

/* 메시지 텍스트 포맷 (@봇 / 슬래시 강조) */
function fmt(text) {
  const parts = text.split(/(@봇|\/[가-힣]+(?:\s\S+)?)/g);
  return parts.map((p, i) => {
    if (p === "@봇") return <span className="mention" key={i}>@봇</span>;
    if (/^\/[가-힣]/.test(p)) return <span className="cmd" key={i}>{p}</span>;
    return <span key={i}>{p}</span>;
  });
}

/* 한 개 메시지 */
function Message({ m, ctx }) {
  if (m.author === "bot") {
    return (
      <div className="msg bot fade-in">
        <div className="ava"><ChIcon.bot s={18}/></div>
        <div className="body-col">
          <div className="who"><span className="name">여행봇</span><span className="bot-tag">BOT</span><span className="time">{m.time}</span></div>
          <BotContent m={m} ctx={ctx}/>
        </div>
      </div>
    );
  }
  const mem = CH_MEM[m.author];
  const isMe = m.author === CH_ME;
  return (
    <div className={"msg fade-in" + (isMe ? " me" : "")}>
      <div className="ava" style={{ background: mem.color }}>{mem.name[0]}</div>
      <div className="body-col">
        <div className="who">
          <span className="name">{mem.name}</span>
          {mem.role === "host" && <span className="role-tag">방장</span>}
          <span className="time">{m.time}</span>
        </div>
        <div className="bubble">{fmt(m.text)}</div>
      </div>
    </div>
  );
}

/* 봇 메시지 내용 분기 */
function BotContent({ m, ctx }) {
  switch (m.kind) {
    case "bubble":
      return <div className="bubble bot" style={{ maxWidth: 560 }}>{m.text}</div>;
    case "error":
      return <div className="state-error" style={{ maxWidth: 560 }}><ChIcon.x s={15} style={{ flex: "none", marginTop: 1 }}/> {m.text}</div>;
    case "noresult":
      return <window.NoResultCard q={m.q}/>;
    case "clarify":
      return (
        <div>
          <div className="bubble bot" style={{ maxWidth: 520 }}>{m.text}</div>
          <div className="clarify-chips">
            {m.options.map((o, i) => (
              <button key={i} className="qchip" onClick={() => ctx.onClarifyPick(o)}>{o.label}</button>
            ))}
          </div>
        </div>
      );
    case "queue":
      return <div className="queue-note"><ChIcon.clock s={16}/> 앞 작업이 끝나면 처리할게요 — <b style={{ marginLeft: 2 }}>대기 중</b> ({m.text})</div>;
    case "working":
      return <window.WorkingCard step={ctx.workStep} onCancel={ctx.onCancelWork}/>;
    case "places":
      return <window.PlaceOptionsCard payload={m.payload} addedIds={ctx.addedIds} onAdd={ctx.onAdd} onSetLodging={ctx.onSetLodging} onFocusMap={ctx.onFocusMap}/>;
    case "itinerary":
      return <window.ItineraryCard itinerary={ctx.itinerary} role={ctx.role} confirmed={ctx.confirmed} selectedStop={ctx.selectedStop} onSelectStop={ctx.onSelectStop} onConfirm={ctx.onConfirm} onModify={ctx.onModify}/>;
    case "compare":
      return <window.CompareCard payload={m.payload} onPick={ctx.onPickCompare}/>;
    case "map":
      return <window.MapCard candidates={ctx.candidates} itinerary={ctx.itinerary} selectedId={ctx.selectedId} onSelect={ctx.onFocusMap}/>;
    default:
      return null;
  }
}

/* 채팅 영역 */
function ChatArea({ messages, ctx, composer }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, ctx.workStep]);

  return (
    <div className="chat-col">
      <div className="chat-scroll scroll" ref={scrollRef}>
        <div className="chat-inner">
          <div className="day-divider"><span className="ln"></span><span className="lbl">오늘</span><span className="ln"></span></div>
          {messages.map((m) => <Message key={m.id} m={m} ctx={ctx}/>)}
        </div>
      </div>
      {composer}
    </div>
  );
}

/* 컴포저 */
function Composer({ role, working, onSend }) {
  const [val, setVal] = useState("");
  const [armed, setArmed] = useState(false);
  const [focus, setFocus] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const taRef = useRef(null);

  const slashOpen = val.startsWith("/");
  const slashMatches = CH_SLASH.filter((s) => s.k.startsWith(val.split(" ")[0]) && (!s.host || role === "host"));

  const autoSize = () => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };
  useEffect(autoSize, [val]);

  const doSend = (textOverride) => {
    let text = (textOverride != null ? textOverride : val).trim();
    if (!text) return;
    const callsBot = armed || text.startsWith("/") || text.includes("@봇");
    let payloadText = text;
    if (armed && !text.startsWith("@봇") && !text.startsWith("/")) payloadText = "@봇 " + text;
    onSend(payloadText, callsBot);
    setVal(""); setArmed(false);
    requestAnimationFrame(() => taRef.current && taRef.current.focus());
  };

  const onKey = (e) => {
    if (slashOpen && slashMatches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => (i + 1) % slashMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length); return; }
      if (e.key === "Tab" || (e.key === "Enter" && val.trim() === slashMatches[slashIdx]?.k)) {
        // allow enter to send if full command typed
      }
      if (e.key === "Tab") { e.preventDefault(); setVal(slashMatches[slashIdx].k + " "); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  return (
    <div className="composer-wrap">
      <div className="composer-inner" style={{ position: "relative" }}>
        {armed && (
          <div className="armed-banner"><ChIcon.bot s={15}/> 봇에게 보냅니다 — 보낼 내용을 입력하세요. (예: 후보로 2박 3일 일정 짜줘)</div>
        )}
        <div className="quick-chips">
          {CH_SLASH.filter((s) => !s.host || role === "host").map((s) => (
            <button key={s.k} className="qchip" onClick={() => { setVal(s.k + " "); setArmed(false); taRef.current && taRef.current.focus(); }}>
              <span className="k">{s.k}</span>
            </button>
          ))}
        </div>

        {slashOpen && slashMatches.length > 0 && (
          <div className="slash-pop">
            {slashMatches.map((s, i) => (
              <div key={s.k} className={"slash-item" + (i === slashIdx ? " active" : "")}
                   onMouseEnter={() => setSlashIdx(i)} onClick={() => { setVal(s.k + " "); taRef.current && taRef.current.focus(); }}>
                <span className="k">{s.k}</span>
                <span className="d">{s.d}</span>
                {s.host && <span className="host-only">방장</span>}
              </div>
            ))}
          </div>
        )}

        <div className={"composer" + (focus ? " focus" : "")}>
          <button className={"bot-call-btn" + (armed ? " armed" : "")} onClick={() => { setArmed((a) => !a); taRef.current && taRef.current.focus(); }} title="봇 부르기">
            <ChIcon.bot s={17}/> 봇 부르기
          </button>
          <textarea ref={taRef} rows={1} value={val} placeholder={armed ? "봇에게 보낼 내용…" : "메시지 입력 ·  / 로 커맨드,  봇 부르기로 봇 호출"}
                    onChange={(e) => { setVal(e.target.value); setSlashIdx(0); }} onKeyDown={onKey}
                    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}/>
          <button className="send-btn" disabled={!val.trim()} onClick={() => doSend()}><ChIcon.send s={18}/></button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ChatArea, Composer });
