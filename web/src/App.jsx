import { useEffect, useRef, useState } from "react";
import { connectRoom } from "./ws.js";
import { Icon } from "./icons.jsx";
import { ChatArea, Composer } from "./chat.jsx";
import { LobbyScreen, CreateRoomModal, JoinRoomModal } from "./lobby.jsx";
import { loadMe, saveMe, loadRooms, rememberRoom, forgetRoom, makeRoomCode } from "./rooms.js";

const _loc = typeof location !== "undefined" ? location : { search: "", hostname: "localhost" };
const WS_BASE = import.meta.env.VITE_WS_BASE || `ws://${_loc.hostname || "localhost"}:8000`;

const S = {
  app: { display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--font)" },
  head: { display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: "1px solid var(--line)", background: "var(--surface)" },
  body: { flex: 1, display: "flex", minHeight: 0 },
  panel: { width: 300, borderLeft: "1px solid var(--line)", background: "var(--surface-2)", overflowY: "auto", padding: 14 },
  btn: { border: "none", background: "var(--accent)", color: "#fff", borderRadius: "var(--pill)", padding: "0 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 700 },
  chip: { fontSize: 11, fontWeight: 700, color: "var(--accent-700)", background: "var(--accent-50)", borderRadius: "var(--pill)", padding: "2px 8px" },
  miniBtn: { border: "1px solid var(--line-2)", background: "var(--surface)", borderRadius: "var(--r-xs)", padding: "5px 10px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, color: "var(--accent-700)" },
  ghostBtn: { border: "1px solid var(--line-2)", background: "var(--surface)", color: "var(--ink-2)", borderRadius: "var(--pill)", padding: "5px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 },
};

function updateUrl(room, me) {
  if (typeof history === "undefined") return;
  const p = new URLSearchParams({ room, me });
  history.replaceState(null, "", `?${p.toString()}`);
}

export default function App() {
  const params = new URLSearchParams(_loc.search);
  const urlRoom = params.get("room") || "";
  const urlMe = params.get("me") || "";

  const [me, setMe] = useState(urlMe || loadMe());
  const [session, setSession] = useState(() => {
    if (urlRoom && (urlMe || loadMe())) {
      const known = loadRooms().find((r) => r.id === urlRoom);
      return { room: urlRoom, role: known?.role || "traveler", meta: known || null };
    }
    return null;
  });
  const [modal, setModal] = useState(null); // null | "new" | "join"

  useEffect(() => { if (me) saveMe(me); }, [me]);

  const enter = (room, role, meta) => {
    const rec = { id: room, role, emoji: meta?.emoji, dest: meta?.dest, destination: meta?.destination, dates: meta?.dates, base: meta?.base };
    rememberRoom(rec);
    updateUrl(room, me);
    setSession({ room, role, meta: meta || rec });
    setModal(null);
  };

  const onCreate = (meta) => {
    const code = makeRoomCode(meta.dest + ":" + me + ":" + Date.now());
    enter(code, "host", meta);
  };
  const onJoinCode = (code) => enter(code, "traveler", null);
  const onEnterExisting = (r) => enter(r.id, r.role || "traveler", r);

  if (!session) {
    return (
      <>
        <LobbyScreen
          me={me} onMe={setMe} rooms={loadRooms()}
          onEnter={onEnterExisting}
          onNew={() => setModal("new")}
          onJoin={() => setModal("join")}
          onForget={(id) => { forgetRoom(id); setMe((m) => m); }}
        />
        {modal === "new" && <CreateRoomModal onClose={() => setModal(null)} onCreate={onCreate} />}
        {modal === "join" && <JoinRoomModal onClose={() => setModal(null)} onJoin={onJoinCode} />}
      </>
    );
  }

  return <RoomView key={session.room} room={session.room} me={me} role={session.role} meta={session.meta} onLobby={() => { updateUrl("", ""); setSession(null); }} />;
}

function RoomView({ room, me, role, meta, onLobby }) {
  const [status, setStatus] = useState("연결 중…");
  const [msgs, setMsgs] = useState([]);
  const [state, setState] = useState(null);
  const [copied, setCopied] = useState(false);
  const connRef = useRef(null);
  const keyRef = useRef(0);

  const push = (m) => setMsgs((xs) => [...xs, { _k: keyRef.current++, ...m }]);

  useEffect(() => {
    const conn = connectRoom(`${WS_BASE}/ws/${room}`, {
      onOpen: () => {
        setStatus("연결됨");
        // 방을 만든 사람(host)만 방장·메타를 등록한다(참여자는 건드리지 않음).
        if (role === "host" && meta) {
          conn.sendAction({ action: "set_meta", destination: meta.destination || meta.dest || "", dates: meta.dates || "", owner: me });
          if (meta.base) conn.sendAction({ action: "set_accommodation", place: { id: meta.base, name: meta.base, category: "숙소", address: "", x: 0, y: 0 } });
        }
      },
      onClose: () => setStatus("연결 끊김"),
      onText: (m) => push({ author: m.speaker, text: m.text }),
      onCard: (card) => push({ card }),
      onState: (s) => setState(s),
      onError: (t) => push({ author: "시스템", text: "⚠ " + t }),
    });
    connRef.current = conn;
    return () => conn.close();
  }, [room]);

  const addCandidate = (o) =>
    connRef.current?.sendAction({
      action: "add_candidate",
      place: { id: o.id || o.name, name: o.name, category: o.category || "", address: o.address || "", x: o.x || 0, y: o.y || 0 },
    });
  const removeCandidate = (id) => connRef.current?.sendAction({ action: "remove_candidate", place_id: id });
  const confirm = () => connRef.current?.sendAction({ action: "confirm_itinerary", by: me });

  const copyCode = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(room).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const candidates = state?.candidates || [];
  const addedIds = new Set(candidates.map((c) => c.id));
  const isHost = state?.owner ? state.owner === me : role === "host";
  const title = state?.destination || meta?.dest || room;

  return (
    <div style={S.app}>
      <header style={S.head}>
        <button onClick={onLobby} title="내 방 목록으로" style={{ ...S.ghostBtn, padding: "5px 10px" }}><Icon.list s={15} /></button>
        <span style={{ color: "var(--accent)", display: "flex" }}><Icon.bot s={22} /></span>
        <strong>{title}</strong>
        {isHost && <span style={{ ...S.chip, color: "var(--coral, #E0567B)", background: "var(--coral-50, #FCE7EE)" }}><Icon.crown s={12} /> 방장</span>}
        <button onClick={copyCode} style={{ ...S.ghostBtn }} title="방 코드 복사">
          <Icon.send s={13} /> {copied ? "복사됨" : `코드 ${room}`}
        </button>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: status === "연결됨" ? "var(--accent)" : "var(--ink-3)" }}>● {status}</span>
      </header>

      <div style={S.body}>
        <ChatArea
          messages={msgs}
          ctx={{ me, addedIds, onAdd: addCandidate, confirmed: state?.confirmed }}
          composer={<Composer onSend={(text) => connRef.current?.sendChat(me, text)} />}
        />

        <aside style={S.panel}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>후보 장소 {candidates.length ? `(${candidates.length})` : ""}</strong>
            {state?.confirmed && <span style={{ ...S.chip, color: "var(--accent-700)" }}><Icon.check s={12} /> 확정됨</span>}
          </div>
          {(state?.dates || meta?.dates) && (
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
              <Icon.calendar s={13} /> {state?.dates || meta?.dates}
              {(state?.accommodations?.[0]?.name || meta?.base) && <><span style={{ margin: "0 2px" }}>·</span><Icon.pin s={12} /> {state?.accommodations?.[0]?.name || meta?.base}</>}
            </div>
          )}
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
          {isHost && (state?.working_itinerary?.length || 0) > 0 && (
            <button style={{ ...S.btn, width: "100%", justifyContent: "center", marginTop: 14, padding: "9px 0" }} onClick={confirm}>
              <Icon.check s={15} /> 일정 확정 (방장)
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
