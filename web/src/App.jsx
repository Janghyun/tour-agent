import { useEffect, useRef, useState } from "react";
import { connectRoom } from "./ws.js";
import { Icon } from "./icons.jsx";
import { ChatArea, Composer } from "./chat.jsx";

const params = new URLSearchParams(location.search);
const WS_BASE = import.meta.env.VITE_WS_BASE || `ws://${location.hostname || "localhost"}:8000`;
const ROOM = params.get("room") || "jeju";
const ME = params.get("me") || "나";

const S = {
  app: { display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--font)" },
  head: { display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid var(--line)", background: "var(--surface)" },
  body: { flex: 1, display: "flex", minHeight: 0 },
  chat: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  stream: { flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 },
  panel: { width: 300, borderLeft: "1px solid var(--line)", background: "var(--surface-2)", overflowY: "auto", padding: 14 },
  composer: { display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--line)", background: "var(--surface)" },
  input: { flex: 1, border: "1px solid var(--line-2)", borderRadius: "var(--pill)", padding: "10px 16px", fontSize: 14, outline: "none", fontFamily: "inherit" },
  btn: { border: "none", background: "var(--accent)", color: "#fff", borderRadius: "var(--pill)", padding: "0 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 700 },
  card: { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 14, boxShadow: "var(--sh-1)", maxWidth: 460 },
  chip: { fontSize: 11, fontWeight: 700, color: "var(--accent-700)", background: "var(--accent-50)", borderRadius: "var(--pill)", padding: "2px 8px" },
  miniBtn: { border: "1px solid var(--line-2)", background: "var(--surface)", borderRadius: "var(--r-xs)", padding: "5px 10px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent-700)" },
};

export default function App() {
  const [status, setStatus] = useState("연결 중…");
  const [msgs, setMsgs] = useState([]);
  const [state, setState] = useState(null);
  const connRef = useRef(null);
  const keyRef = useRef(0);

  const push = (m) => setMsgs((xs) => [...xs, { _k: keyRef.current++, ...m }]);

  useEffect(() => {
    const conn = connectRoom(`${WS_BASE}/ws/${ROOM}`, {
      onOpen: () => setStatus("연결됨"),
      onClose: () => setStatus("연결 끊김"),
      onText: (m) => push({ author: m.speaker, text: m.text }),
      onCard: (card) => push({ card }),
      onState: (s) => setState(s),
      onError: (t) => push({ author: "시스템", text: "⚠ " + t }),
    });
    connRef.current = conn;
    return () => conn.close();
  }, []);

  const addCandidate = (o) =>
    connRef.current?.sendAction({
      action: "add_candidate",
      place: { id: o.id || o.name, name: o.name, category: o.category || "", address: o.address || "", x: o.x || 0, y: o.y || 0 },
    });
  const removeCandidate = (id) =>
    connRef.current?.sendAction({ action: "remove_candidate", place_id: id });
  const confirm = () => connRef.current?.sendAction({ action: "confirm_itinerary", by: ME });

  const candidates = state?.candidates || [];
  const addedIds = new Set(candidates.map((c) => c.id));

  return (
    <div style={S.app}>
      <header style={S.head}>
        <span style={{ color: "var(--accent)", display: "flex" }}><Icon.bot s={22} /></span>
        <strong>여행봇 · {ROOM}</strong>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: status === "연결됨" ? "var(--accent)" : "var(--ink-3)" }}>● {status}</span>
      </header>

      <div style={S.body}>
        <ChatArea
          messages={msgs}
          ctx={{ me: ME, addedIds, onAdd: addCandidate, confirmed: state?.confirmed }}
          composer={<Composer onSend={(text) => connRef.current?.sendChat(ME, text)} />}
        />

        <aside style={S.panel}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>후보 장소 {candidates.length ? `(${candidates.length})` : ""}</strong>
            {state?.confirmed && <span style={{ ...S.chip, color: "var(--accent-700)" }}><Icon.check s={12} /> 확정됨</span>}
          </div>
          {candidates.length === 0 && <div style={{ fontSize: 13, color: "var(--ink-3)" }}>아직 담긴 후보가 없어요. 검색 카드에서 ‘추가’로 담아 보세요.</div>}
          {candidates.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                {c.category && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{c.category}</div>}
              </div>
              <button style={{ ...S.miniBtn, border: "none", color: "var(--ink-3)" }} onClick={() => removeCandidate(c.id)} aria-label="삭제"><Icon.trash s={15} /></button>
            </div>
          ))}
          {(state?.working_itinerary?.length || 0) > 0 && (
            <button style={{ ...S.btn, width: "100%", justifyContent: "center", marginTop: 14, padding: "9px 0" }} onClick={confirm}>
              <Icon.check s={15} /> 일정 확정 (방장)
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
