/* 채팅 메시지 + 컴포저 — 디자인 프로토타입에서 포팅(ESM), 백엔드 메시지로 구동.
 * 메시지: 사람 {author,text} · 봇 텍스트 {author:"봇",text} · 봇 카드 {author:"봇",card} · 시스템 {author:"시스템",text} */
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { SLASH } from "./constants.js";
import { PlaceOptionsCard, ItineraryCard, MapCard } from "./cards.jsx";

const MEM_COLORS = ["#1F8A5B", "#FF7A59", "#2F86C7", "#9B6FE0", "#E0567B", "#E8962F"];
function colorFor(name = "") {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MEM_COLORS[h % MEM_COLORS.length];
}

function fmt(text = "") {
  return text.split(/(@봇|\/[가-힣]+)/g).map((p, i) => {
    if (p === "@봇") return <span className="mention" key={i}>@봇</span>;
    if (/^\/[가-힣]/.test(p)) return <span className="cmd" key={i}>{p}</span>;
    return <span key={i}>{p}</span>;
  });
}

function CardBody({ card, ctx }) {
  if (card.type === "place_options")
    return <PlaceOptionsCard card={card} onAdd={ctx.onAdd} addedIds={ctx.addedIds} />;
  if (card.type === "itinerary") return <ItineraryCard card={card} confirmed={ctx.confirmed} />;
  if (card.type === "map") return <MapCard card={card} />;
  return <div className="bubble bot">{JSON.stringify(card)}</div>;
}

function Message({ m, ctx }) {
  const bot = m.author === "봇";
  const sys = m.author === "시스템";
  if (m.card || bot || sys) {
    return (
      <div className="msg bot fade-in">
        <div className="ava"><Icon.bot s={18} /></div>
        <div className="body-col">
          <div className="who">
            <span className="name">{sys ? "시스템" : "여행봇"}</span>
            {!sys && <span className="bot-tag">BOT</span>}
          </div>
          {m.card ? <CardBody card={m.card} ctx={ctx} /> : (
            sys
              ? <div className="state-error" style={{ maxWidth: 560 }}>{m.text}</div>
              : <div className="bubble bot" style={{ maxWidth: 560 }}>{m.text}</div>
          )}
        </div>
      </div>
    );
  }
  const isMe = m.author === ctx.me;
  return (
    <div className={"msg fade-in" + (isMe ? " me" : "")}>
      <div className="ava" style={{ background: colorFor(m.author) }}>{(m.author || "?")[0]}</div>
      <div className="body-col">
        <div className="who"><span className="name">{m.author}</span></div>
        <div className="bubble">{fmt(m.text)}</div>
      </div>
    </div>
  );
}

export function ChatArea({ messages, ctx, composer }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  return (
    <div className="chat-col">
      <div className="chat-scroll scroll" ref={ref}>
        <div className="chat-inner">
          <div className="day-divider"><span className="ln"></span><span className="lbl">오늘</span><span className="ln"></span></div>
          {messages.length === 0 && (
            <div className="note" style={{ textAlign: "center", margin: "20px 0" }}>
              봇 부르기 또는 <span className="cmd">/검색</span>으로 장소를 찾고, <span className="cmd">/일정</span>으로 일정을 만들어 보세요.
            </div>
          )}
          {messages.map((m) => <Message key={m._k} m={m} ctx={ctx} />)}
        </div>
      </div>
      {composer}
    </div>
  );
}

export function Composer({ onSend }) {
  const [val, setVal] = useState("");
  const [armed, setArmed] = useState(false);
  const [focus, setFocus] = useState(false);
  const [slashIdx, setSlashIdx] = useState(0);
  const taRef = useRef(null);

  const slashOpen = val.startsWith("/");
  const slashMatches = SLASH.filter((s) => s.k.startsWith(val.split(" ")[0]));

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [val]);

  const doSend = () => {
    let text = val.trim();
    if (!text) return;
    if (armed && !text.startsWith("@봇") && !text.startsWith("/")) text = "@봇 " + text;
    onSend(text);
    setVal("");
    setArmed(false);
    requestAnimationFrame(() => taRef.current && taRef.current.focus());
  };

  const onKey = (e) => {
    if (slashOpen && slashMatches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => (i + 1) % slashMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length); return; }
      if (e.key === "Tab") { e.preventDefault(); setVal(slashMatches[slashIdx].k + " "); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  return (
    <div className="composer-wrap">
      <div className="composer-inner" style={{ position: "relative" }}>
        {armed && (
          <div className="armed-banner"><Icon.bot s={15} /> 봇에게 보냅니다 — 보낼 내용을 입력하세요.</div>
        )}
        <div className="quick-chips">
          {SLASH.map((s) => (
            <button key={s.k} className="qchip" onClick={() => { setVal(s.k + " "); setArmed(false); taRef.current && taRef.current.focus(); }}>
              <span className="k">{s.k}</span>
            </button>
          ))}
        </div>
        {slashOpen && slashMatches.length > 0 && (
          <div className="slash-pop">
            {slashMatches.map((s, i) => (
              <div key={s.k} className={"slash-item" + (i === slashIdx ? " active" : "")}
                   onMouseEnter={() => setSlashIdx(i)}
                   onClick={() => { setVal(s.k + " "); taRef.current && taRef.current.focus(); }}>
                <span className="k">{s.k}</span>
                <span className="d">{s.d}</span>
                {s.host && <span className="host-only">방장</span>}
              </div>
            ))}
          </div>
        )}
        <div className={"composer" + (focus ? " focus" : "")}>
          <button className={"bot-call-btn" + (armed ? " armed" : "")} onClick={() => { setArmed((a) => !a); taRef.current && taRef.current.focus(); }} title="봇 부르기">
            <Icon.bot s={17} /> 봇 부르기
          </button>
          <textarea ref={taRef} rows={1} value={val}
                    placeholder={armed ? "봇에게 보낼 내용…" : "메시지 입력 ·  / 로 커맨드,  봇 부르기로 봇 호출"}
                    onChange={(e) => { setVal(e.target.value); setSlashIdx(0); }}
                    onKeyDown={onKey}
                    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />
          <button className="send-btn" disabled={!val.trim()} onClick={doSend}><Icon.send s={18} /></button>
        </div>
      </div>
    </div>
  );
}
