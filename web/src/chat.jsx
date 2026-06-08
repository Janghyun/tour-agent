/* 채팅 메시지 + 컴포저 — 디자인 프로토타입에서 포팅(ESM), 백엔드 메시지로 구동.
 * 메시지: 사람 {author,text} · 봇 텍스트 {author:"봇",text} · 봇 카드 {author:"봇",card} · 시스템 {author:"시스템",text} */
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Icon } from "./icons.jsx";
import { SLASH } from "./constants.js";
import { PlaceOptionsCard, ItineraryCard, MapCard, CompareCard } from "./cards.jsx";

// 봇 텍스트는 보통 markdown(표·볼드·리스트) — 버블 안에서 포맷에 맞춰 렌더한다.
function BotMarkdown({ text }) {
  return (
    <div className="bubble bot md" style={{ maxWidth: 560 }}>
      <Markdown remarkPlugins={[remarkGfm]}>{text || ""}</Markdown>
    </div>
  );
}

const MEM_COLORS = ["#1F8A5B", "#FF7A59", "#2F86C7", "#9B6FE0", "#E0567B", "#E8962F"];
function colorFor(name = "") {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MEM_COLORS[h % MEM_COLORS.length];
}

const URL_RE = /https?:\/\/[^\s]+/g;

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
  if (card.type === "itinerary") return <ItineraryCard card={card} confirmed={ctx.confirmed} onExport={ctx.onExport} />;
  if (card.type === "compare")
    return <CompareCard card={card} onAdd={ctx.onAdd} addedIds={ctx.addedIds} />;
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
            {m.took != null && <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6 }}>{m.took}초 걸림</span>}
            {ctx.canDelete && ctx.onDelete && m.mid && (
              <button onClick={() => ctx.onDelete(m.mid)} title="이 답변/카드 삭제"
                      style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-4)", padding: 2, display: "inline-flex" }}>
                <Icon.trash s={14} />
              </button>
            )}
          </div>
          {m.card ? <CardBody card={m.card} ctx={ctx} /> : (
            sys
              ? <div className="state-error" style={{ maxWidth: 560 }}>{m.text}</div>
              : <BotMarkdown text={m.text} />
          )}
        </div>
      </div>
    );
  }
  const isMe = m.author === ctx.me;
  const urls = (m.text || "").match(URL_RE) || [];
  return (
    <div className={"msg fade-in" + (isMe ? " me" : "")}>
      <div className="ava" style={{ background: colorFor(m.author) }}>{(m.author || "?")[0]}</div>
      <div className="body-col">
        <div className="who"><span className="name">{m.author}</span></div>
        <div className="bubble">{fmt(m.text)}</div>
        {urls.length > 0 && ctx.onAddLink && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {urls.map((u, i) => (
              <button key={i} className="btn btn-soft btn-sm" onClick={() => ctx.onAddLink(u)} title={u}>
                <Icon.plus s={13} /> 이 링크 후보 등록
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const GUIDE_STEPS = [
  { n: 1, t: "봇에게 장소 검색", d: "‘봇 부르기’를 켜고 보내거나 @봇 / /검색 — 예) @봇 성산 근처 흑돼지" },
  { n: 2, t: "카드에서 ‘추가’", d: "마음에 드는 곳을 추가하면 방 전체가 함께 보는 후보 풀에 담겨요" },
  { n: 3, t: "더 받고 견주기", d: "/추천 으로 더 찾고, /비교 로 한 끼의 대안 2~3곳을 나란히 비교" },
  { n: 4, t: "일정 만들기", d: "후보가 모이면 /일정 — 숙소·동선을 고려해 하루 일정 카드를 짜 줘요" },
  { n: 5, t: "방장이 확정", d: "/확정 으로 작업 중 일정을 확정 일정으로 고정(방장만)" },
];

export function Guide({ compact = false }) {
  return (
    <div className="guide-card" style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 16, boxShadow: compact ? "none" : "var(--sh-1)", maxWidth: 560, margin: compact ? 0 : "10px auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: "var(--accent)", display: "flex" }}><Icon.bot s={20} /></span>
        <strong style={{ fontSize: 15 }}>여행봇 사용법</strong>
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 12 }}>
        여러 명이 한 방에서 봇을 불러 장소를 모으고, 봇이 동선·숙소를 고려해 일정을 짜 줍니다. 봇은 <b>직접 부를 때만</b> 답해요.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {GUIDE_STEPS.map((s) => (
          <div key={s.n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ width: 22, height: 22, flex: "none", borderRadius: "50%", background: "var(--accent-50)", color: "var(--accent-700)", fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center" }}>{s.n}</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.t}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{s.d}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", marginBottom: 6 }}>슬래시 커맨드</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {SLASH.map((s) => (
            <div key={s.k} style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
              <span className="cmd" style={{ flex: "none", minWidth: 48 }}>{s.k}</span>
              <span style={{ color: "var(--ink-3)" }}>{s.d}{s.host ? " (방장)" : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TypingBubble({ elapsed, query }) {
  const q = (query || "").replace(/^@봇\s*/, "").trim();
  return (
    <div className="msg bot fade-in">
      <div className="ava"><Icon.bot s={18} /></div>
      <div className="body-col">
        <div className="who">
          <span className="name">여행봇</span><span className="bot-tag">BOT</span>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)", marginLeft: 6 }}>
            응답 준비 중{elapsed > 0 ? ` · ${elapsed}초` : ""}
          </span>
        </div>
        {q && (
          <div style={{ fontSize: 12, color: "var(--ink-3)", margin: "1px 0 5px", maxWidth: 460, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            “{q}” 처리 중…
          </div>
        )}
        <div className="bubble bot typing-bubble" aria-label="여행봇이 응답을 준비하고 있어요">
          <span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span>
        </div>
      </div>
    </div>
  );
}

export function ChatArea({ messages, pending, elapsed, pendingText, ctx, composer }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending]);
  return (
    <div className="chat-col">
      <div className="chat-scroll scroll" ref={ref}>
        <div className="chat-inner">
          <div className="day-divider"><span className="ln"></span><span className="lbl">오늘</span><span className="ln"></span></div>
          {messages.length === 0 && <Guide />}
          {messages.map((m) => <Message key={m._k} m={m} ctx={ctx} />)}
          {pending && <TypingBubble elapsed={elapsed} query={pendingText} />}
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
    // 한글 IME 조합 중 Enter는 마지막 글자를 중복 전송하므로 무시한다(조합 완료 후 전송).
    if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
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
