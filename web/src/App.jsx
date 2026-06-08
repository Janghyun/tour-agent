import { useEffect, useRef, useState } from "react";
import { connectRoom } from "./ws.js";
import { Icon } from "./icons.jsx";
import { ChatArea, Composer, Guide } from "./chat.jsx";
import { LobbyScreen, CreateRoomModal, JoinRoomModal } from "./lobby.jsx";
import { SidePanel } from "./panel.jsx";
import { loadMe, saveMe, loadRooms, rememberRoom, forgetRoom, makeRoomCode, roomCred, saveRoomCred, saveAdminKey, loadAdminKey, randomToken } from "./rooms.js";
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
  const urlInvite = params.get("invite") || "";
  // 초대 링크(?room=&invite=)로 들어오면 그 방의 초대코드를 이 기기에 저장해 재입장에도 쓰게 한다.
  if (urlRoom && urlInvite) saveRoomCred(urlRoom, { invite: urlInvite });

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
    // 방 생성: 관리자 키 저장 + 이 방의 소유권 토큰 발급(방장 증명용).
    if (meta.adminKey) saveAdminKey(meta.adminKey);
    saveRoomCred(code, { ownerToken: randomToken() });
    enter(code, "host", meta);
  };
  const onJoinCode = (code, invite) => {
    if (invite) saveRoomCred(code, { invite });
    enter(code, "traveler", null);
  };
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
  const [historyItems, setHistoryItems] = useState([]); // 내보낸 기록(백엔드, 방 멤버 공유)
  const [denied, setDenied] = useState(null); // 입장 거부 사유(게이팅)
  const [invite, setInvite] = useState(() => roomCred(room).invite || ""); // 초대 코드(공유용)
  const [inviteCopied, setInviteCopied] = useState(false);
  const deniedRef = useRef(false); // 거부되면 재연결 중단
  const connRef = useRef(null);
  const keyRef = useRef(2_000_000); // 복원 메시지 _k와 충돌 방지(새 메시지는 큰 값부터)
  const startRef = useRef(0); // 봇 응답 시작 시각(소요 시간 계산용)

  const push = (m) => setMsgs((xs) => [...xs, { _k: keyRef.current++, ...m }]);

  // 봇 응답 대기 중 경과 시간 카운트 + 안전장치(끝내 응답이 없으면 인디케이터를 풀어준다).
  useEffect(() => {
    if (!pending) { setElapsed(0); return; }
    const id = setInterval(() => {
      const sec = Math.round((Date.now() - startRef.current) / 1000);
      setElapsed(sec);
      if (sec >= 200) {  // 백엔드 150s 타임아웃보다 여유. 그래도 응답이 없으면 UI 잠금 해제.
        startRef.current = 0;
        setPending(false);
        push({ author: "시스템", text: "⚠ 응답이 오지 않아 중단했어요. 잠시 후 다시 시도해 주세요." });
      }
    }, 500);
    return () => clearInterval(id);
  }, [pending]);

  useEffect(() => {
    let closed = false;       // 컴포넌트 정리/방 전환으로 우리가 닫은 경우(재연결 안 함)
    let retry = null;
    let attempts = 0;

    const connect = () => {
      const conn = connectRoom(`${WS_BASE}/ws/${room}`, {
        onOpen: () => {
          attempts = 0;
          setStatus("연결됨");
          // 재연결 시 백엔드가 history를 다시 보내므로, 중복을 막기 위해 메시지를 초기화하고
          // 새로 받은 history로 다시 채운다(모든 메시지는 백엔드가 보존·재전송한다).
          setMsgs([]);
          // 입장 핸드셰이크 — 가장 먼저 보낸다(게이팅 모드면 백엔드가 이걸로 인가).
          const cred = roomCred(room);
          const join = { name: me };
          if (cred.ownerToken) join.ownerToken = cred.ownerToken;
          if (cred.invite) join.inviteCode = cred.invite;
          if (role === "host") join.adminKey = loadAdminKey();
          conn.sendAction({ join });
          // 방을 만든 사람(host)만 방장·메타를 등록한다(참여자는 건드리지 않음).
          if (role === "host" && meta) {
            conn.sendAction({ action: "set_meta", destination: meta.destination || meta.dest || "", dates: meta.dates || "", owner: me });
            if (meta.base) conn.sendAction({ action: "set_accommodation", place: { id: meta.base, name: meta.base, category: "숙소", address: "", x: 0, y: 0 } });
          }
        },
        onAdmitted: (m) => {
          // 방장이면 발급된 초대 코드를 저장·표시(친구 초대 링크 공유용).
          if (m.owner && m.invite) { saveRoomCred(room, { invite: m.invite }); setInvite(m.invite); }
        },
        onDenied: (m) => {
          deniedRef.current = true;  // 재연결 중단
          setStatus("입장 거부됨");
          setDenied(m.reason || "이 방에 입장할 수 없어요.");
        },
        onClose: () => {
          if (closed || deniedRef.current) return;  // 우리가 닫았거나 입장 거부면 재연결 안 함
          // 대기 중이던 응답은 연결이 끊겨 못 받으니 인디케이터를 풀어준다(무한 '처리 중' 방지).
          if (startRef.current) { startRef.current = 0; setPending(false); }
          attempts += 1;
          setStatus("연결 끊김 · 재연결 중…");
          retry = setTimeout(connect, Math.min(1000 * attempts, 5000));
        },
        onText: (m) => {
          if (m.speaker === "봇") {
            const took = startRef.current ? Math.round((Date.now() - startRef.current) / 1000) : null;
            startRef.current = 0;
            setPending(false);
            push({ author: m.speaker, text: m.text, took });
          } else {
            push({ author: m.speaker, text: m.text });
          }
        },
        onCard: (card) => {
          const took = startRef.current ? Math.round((Date.now() - startRef.current) / 1000) : null;
          startRef.current = 0;
          setPending(false);
          push({ card, took });
        },
        onState: (s) => setState(s),
        onExports: (items) => setHistoryItems(items),
        onError: (t) => { startRef.current = 0; setPending(false); push({ author: "시스템", text: "⚠ " + t }); },
      });
      connRef.current = conn;
    };

    connect();
    return () => { closed = true; if (retry) clearTimeout(retry); connRef.current?.close(); };
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
    if (t.includes("@봇") || t.startsWith("/")) { setPending(true); setPendingText(text); startRef.current = Date.now(); }
  };
  // 채팅 링크의 '후보 등록' 버튼 — 링크의 장소를 검색해 후보로.
  const addLink = (url) => { connRef.current?.sendAction({ action: "add_place_by_link", url }); setPending(true); setPendingText("링크의 장소를 후보로 등록"); startRef.current = Date.now(); };

  // 일정 카드 '내보내기' — HTML 다운로드 + 백엔드 기록(방 멤버·기기 공유).
  const exportItin = (card) => {
    const html = itineraryToHtml(card, { dest: title, dates: state?.dates });
    const name = card.title || title || "여행일정";
    downloadHtml(html, name);
    connRef.current?.sendAction({ action: "add_export", title: name, dates: state?.dates || "", html, ts: Date.now() });
  };
  const openHistory = () => { setHistoryOpen(true); connRef.current?.sendAction({ action: "list_exports" }); };

  const [tab, setTab] = useState("cand");
  const [selectedId, setSelectedId] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth <= 760);
  const [panelOpen, setPanelOpen] = useState(false);
  // 오른쪽 패널 너비(데스크톱) — 드래그로 조절, localStorage에 유지.
  const [panelW, setPanelW] = useState(() => {
    if (typeof localStorage === "undefined") return 320;
    const v = parseInt(localStorage.getItem("panelWidth") || "", 10);
    return Number.isFinite(v) ? v : 320;
  });
  const draggingRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const f = () => setIsMobile(window.innerWidth <= 760);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("panelWidth", String(panelW)); } catch { /* 무시 */ }
  }, [panelW]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const w = Math.round(window.innerWidth - e.clientX);  // 패널은 오른쪽 — 커서~우측 가장자리 거리
      const min = 260, max = Math.max(min, Math.min(760, window.innerWidth - 360));  // 채팅 최소 360 보장
      setPanelW(Math.max(min, Math.min(max, w)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);
  const startResize = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    if (typeof document !== "undefined") {
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    }
  };
  const focusMap = (id) => { setSelectedId(id); setTab("map"); if (isMobile) setPanelOpen(true); };

  const copyCode = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(room).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 초대 링크 = 현재 페이지 주소 + ?room=&invite= (GH Pages 서브경로 포함).
  const inviteLink = () => {
    const base = typeof location !== "undefined" ? location.origin + location.pathname : "";
    return `${base}?room=${encodeURIComponent(room)}&invite=${encodeURIComponent(invite)}`;
  };
  const copyInvite = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(inviteLink()).catch(() => {});
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  };

  // 게이팅 모드에서 입장 거부되면 방 UI 대신 안내 화면.
  if (denied) {
    return (
      <div style={{ ...S.app, alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
        <div style={{ maxWidth: 380 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h2 style={{ margin: "0 0 8px" }}>입장할 수 없어요</h2>
          <p style={{ color: "var(--ink-2)", marginBottom: 18 }}>{denied}</p>
          <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 18 }}>
            이 방은 초대받은 사람만 들어올 수 있어요. 방장에게 <b>초대 링크</b>를 받아 다시 시도해 주세요.
          </p>
          <button style={{ ...S.btn, justifyContent: "center", padding: "10px 18px" }} onClick={onLobby}>로비로 돌아가기</button>
        </div>
      </div>
    );
  }

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
        {invite && (
          <button onClick={copyInvite} style={{ ...S.ghostBtn, color: "var(--accent-700)" }} title="초대 링크 복사(이 링크로 들어오면 입장 가능)">
            <Icon.plus s={13} /> {inviteCopied ? "링크 복사됨" : "초대 링크"}
          </button>
        )}
        <button onClick={openHistory} style={{ ...S.ghostBtn }} title="내보낸 일정 기록(방 공유)">
          <Icon.calendar s={13} /> 기록
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

        {!isMobile && (
          <div onMouseDown={startResize} title="드래그해서 패널 너비 조절" role="separator" aria-orientation="vertical"
               style={{ width: 8, flex: "none", cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)", borderLeft: "1px solid var(--line)" }}>
            <span style={{ width: 3, height: 34, borderRadius: 3, background: "var(--line-2)" }} />
          </div>
        )}

        {(!isMobile || panelOpen) && (
          <SidePanel
            width={isMobile ? "100%" : panelW}
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
        <div onClick={() => setHistoryOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, maxHeight: "85vh", overflowY: "auto", background: "var(--surface)", borderRadius: "var(--r)", boxShadow: "var(--sh-2)", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: 15, flex: 1 }}>내보낸 일정 기록 <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3)" }}>· 방 멤버 공유</span></strong>
              <button onClick={() => setHistoryOpen(false)} aria-label="닫기" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)" }}><Icon.x s={16} /></button>
            </div>
            {historyItems.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "8px 2px" }}>
                아직 내보낸 일정이 없어요. 일정 카드의 <b>내보내기</b>를 누르면 HTML로 저장되고 방 전체가 여기서 다시 볼 수 있어요.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {historyItems.map((e, i) => (
                  <div key={e.ts || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px", border: "1px solid var(--line)", borderRadius: "var(--r-xs)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{e.dates ? e.dates + " · " : ""}{e.ts ? new Date(e.ts).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }) : ""}</div>
                    </div>
                    <button className="btn btn-soft btn-sm" onClick={() => openHtml(e.html)}><Icon.send s={13} /> 열기</button>
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
