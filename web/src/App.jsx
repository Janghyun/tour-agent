import { useEffect, useRef, useState } from "react";
import { connectRoom } from "./ws.js";
import { Icon } from "./icons.jsx";
import { ChatArea, Composer, Guide } from "./chat.jsx";
import { LobbyScreen, CreateRoomModal, JoinRoomModal } from "./lobby.jsx";
import { SidePanel } from "./panel.jsx";
import { loadMe, saveMe, loadRooms, rememberRoom, forgetRoom, makeRoomCode, loadHistory, saveHistoryEntry, removeHistory } from "./rooms.js";
import { itineraryToHtml, downloadHtml, openHtml } from "./export.js";

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

  const switchRoom = (id) => {
    const r = loadRooms().find((x) => x.id === id) || { id };
    enter(id, r.role || "traveler", r);
  };

  return <RoomView key={session.room} room={session.room} me={me} role={session.role} meta={session.meta} onLobby={() => { updateUrl("", ""); setSession(null); }} onSwitch={switchRoom} />;
}

function RoomView({ room, me, role, meta, onLobby, onSwitch }) {
  const [status, setStatus] = useState("연결 중…");
  const [menuOpen, setMenuOpen] = useState(false);
  const [msgs, setMsgs] = useState([]); // 입장 시 백엔드 히스토리로 채워짐(방 멤버·기기 공유)
  const [state, setState] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false); // 봇 응답 대기 중(타이핑 인디케이터)
  const [pendingText, setPendingText] = useState(""); // 대기 중인 질문 내용
  const [elapsed, setElapsed] = useState(0); // 봇 응답 경과 시간(초)
  const [showGuide, setShowGuide] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const connRef = useRef(null);
  const keyRef = useRef(2_000_000); // 복원 메시지 _k와 충돌 방지(새 메시지는 큰 값부터)

  const push = (m) => setMsgs((xs) => [...xs, { _k: keyRef.current++, ...m }]);

  // 봇 응답 대기 중 경과 시간 카운트.
  useEffect(() => {
    if (!pending) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [pending]);

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
      onText: (m) => { if (m.speaker === "봇") setPending(false); push({ author: m.speaker, text: m.text }); },
      onCard: (card) => { setPending(false); push({ card }); },
      onState: (s) => setState(s),
      onError: (t) => { setPending(false); push({ author: "시스템", text: "⚠ " + t }); },
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
  const toggleLike = (id) => connRef.current?.sendAction({ action: "set_preference", traveler: me, target: id, sentiment: "like" });
  const toggleDislike = (id) => connRef.current?.sendAction({ action: "set_preference", traveler: me, target: id, sentiment: "dislike" });

  // 봇을 부르는 메시지(@봇 또는 슬래시)면 응답 대기 표시를 켠다(백엔드 트리거 판정과 동일).
  const handleSend = (text) => {
    connRef.current?.sendChat(me, text);
    const t = (text || "").trimStart();
    if (t.includes("@봇") || t.startsWith("/")) { setPending(true); setPendingText(text); }
  };
  // 채팅 링크의 '후보 등록' 버튼 — 링크의 장소를 검색해 후보로.
  const addLink = (url) => { connRef.current?.sendAction({ action: "add_place_by_link", url }); setPending(true); setPendingText("링크의 장소를 후보로 등록"); };

  // 일정 카드 '내보내기' — HTML 다운로드 + history 보관(나중에 다시 보기).
  const exportItin = (card) => {
    const html = itineraryToHtml(card, { dest: title, dates: state?.dates });
    const name = card.title || title || "여행일정";
    downloadHtml(html, name);
    saveHistoryEntry(room, { ts: Date.now(), title: name, dates: state?.dates || "", html });
    setHistoryTick((n) => n + 1);
  };

  const [tab, setTab] = useState("cand");
  const [selectedId, setSelectedId] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth <= 760);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const f = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  const focusMap = (id) => { setSelectedId(id); setTab("map"); if (isMobile) setPanelOpen(true); };

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
        <div style={{ position: "relative" }}>
          <button onClick={() => setMenuOpen((o) => !o)} title="방 전환" style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0, font: "inherit", color: "inherit" }}>
            <strong>{title}</strong><Icon.chevD s={15} style={{ color: "var(--ink-3)" }} />
          </button>
          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41, minWidth: 220, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r)", boxShadow: "var(--sh-2)", padding: 6 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-3)", padding: "6px 8px" }}>방 전환</div>
                {loadRooms().map((r) => (
                  <button key={r.id} onClick={() => { setMenuOpen(false); if (r.id !== room) onSwitch(r.id); }}
                          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: r.id === room ? "var(--accent-50)" : "transparent", borderRadius: "var(--r-xs)", padding: "8px", cursor: "pointer", textAlign: "left", font: "inherit" }}>
                    <span style={{ fontSize: 16 }}>{r.emoji || "🗺️"}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.dest || r.id}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>코드 {r.id}{r.dates ? ` · ${r.dates}` : ""}</div>
                    </span>
                    {r.id === room && <Icon.check s={15} style={{ color: "var(--accent)" }} />}
                  </button>
                ))}
                <div style={{ height: 1, background: "var(--line)", margin: "5px 0" }} />
                <button onClick={() => { setMenuOpen(false); onLobby(); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: "transparent", borderRadius: "var(--r-xs)", padding: "8px", cursor: "pointer", font: "inherit", color: "var(--ink-2)" }}>
                  <Icon.plus s={15} /> 새 방 만들기 · 내 방 목록
                </button>
              </div>
            </>
          )}
        </div>
        {isHost && <span style={{ ...S.chip, color: "var(--coral, #E0567B)", background: "var(--coral-50, #FCE7EE)" }}><Icon.crown s={12} /> 방장</span>}
        <button onClick={copyCode} style={{ ...S.ghostBtn }} title="방 코드 복사">
          <Icon.send s={13} /> {copied ? "복사됨" : `코드 ${room}`}
        </button>
        <button onClick={() => setHistoryOpen(true)} style={{ ...S.ghostBtn }} title="내보낸 일정 기록">
          <Icon.calendar s={13} /> 기록{loadHistory(room).length ? ` ${loadHistory(room).length}` : ""}
        </button>
        <button onClick={() => setShowGuide(true)} style={{ ...S.ghostBtn, padding: "5px 10px", fontWeight: 800 }} title="여행봇 사용법">?</button>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: status === "연결됨" ? "var(--accent)" : "var(--ink-3)" }}>● {status}</span>
        {isMobile && (
          <button onClick={() => setPanelOpen((o) => !o)} style={{ ...S.ghostBtn }} title="여행 패널">
            {panelOpen ? <><Icon.bot s={14} /> 채팅</> : <><Icon.list s={14} /> 패널{candidates.length ? ` ${candidates.length}` : ""}</>}
          </button>
        )}
      </header>

      <div style={S.body}>
        {!(isMobile && panelOpen) && (
          <ChatArea
            messages={msgs}
            pending={pending}
            elapsed={elapsed}
            pendingText={pendingText}
            ctx={{ me, addedIds, onAdd: addCandidate, onAddLink: addLink, onExport: exportItin, confirmed: state?.confirmed }}
            composer={<Composer onSend={handleSend} />}
          />
        )}

        {(!isMobile || panelOpen) && (
          <SidePanel
            width={isMobile ? "100%" : 320}
            tab={tab} setTab={setTab}
            candidates={candidates}
            accommodations={state?.accommodations || []}
            preferences={state?.preferences || []}
            itinerary={state?.working_itinerary || []}
            confirmed={state?.confirmed}
            me={me} isHost={isHost}
            selectedId={selectedId} onSelect={setSelectedId}
            onToggleLike={toggleLike} onToggleDislike={toggleDislike}
            onRemove={removeCandidate} onFocusMap={focusMap}
            onConfirm={confirm}
          />
        )}
      </div>

      {showGuide && (
        <div onClick={() => setShowGuide(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto", width: "100%", maxWidth: 580 }}>
            <Guide />
            <button onClick={() => setShowGuide(false)} style={{ ...S.btn, width: "100%", justifyContent: "center", marginTop: 10, padding: "10px 0" }}>닫기</button>
          </div>
        </div>
      )}

      {historyOpen && (
        <div onClick={() => setHistoryOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} data-tick={historyTick}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto", background: "var(--surface)", borderRadius: "var(--r)", boxShadow: "var(--sh-2)", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: 15, flex: 1 }}>내보낸 일정 기록</strong>
              <button onClick={() => setHistoryOpen(false)} aria-label="닫기" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)" }}><Icon.x s={16} /></button>
            </div>
            {loadHistory(room).length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "8px 2px" }}>
                아직 내보낸 일정이 없어요. 일정 카드의 <b>내보내기</b>를 누르면 HTML로 저장되고 여기에 기록돼요.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {loadHistory(room).map((e) => (
                  <div key={e.ts} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--r-xs)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{e.dates ? e.dates + " · " : ""}{new Date(e.ts).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}</div>
                    </div>
                    <button className="btn btn-soft btn-sm" onClick={() => openHtml(e.html)}><Icon.send s={13} /> 열기</button>
                    <button onClick={() => { removeHistory(room, e.ts); setHistoryTick((n) => n + 1); }} aria-label="삭제" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-4)" }}><Icon.trash s={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
