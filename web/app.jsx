/* app.jsx — 메인 앱: 상태관리 · 시나리오 오케스트레이션 · Tweaks */
const { MEMBERS: A_MEM, ME: A_ME, SEED_CANDIDATES, classifyIntent, Scenario, ITINERARY } = window.TA_DATA;
const AIcon = window.Icon;
const RA = React;
const { useState: uS, useEffect: uE, useRef: uR } = React;

/* 색 유틸 */
function hexMix(hex, white, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(white.slice(1), 16);
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}
function applyAccent(hex) {
  const r = document.documentElement.style;
  r.setProperty("--accent", hex);
  r.setProperty("--accent-600", window.shade(hex, -22));
  r.setProperty("--accent-700", window.shade(hex, -40));
  r.setProperty("--accent-50", hexMix(hex, "#ffffff", 0.90));
  r.setProperty("--accent-100", hexMix(hex, "#ffffff", 0.80));
}

let _mid = 100;
const mid = () => "m" + (++_mid);
function clock(base) { const h = 14, m = base; return `${h}:${String(2 + m).padStart(2, "0")}`; }

/* 초기 메시지 */
const SEED_MESSAGES = [
  { id: mid(), author: "younghee", text: "다들 제주 2박 3일 어때? 성산 쪽을 거점으로 잡자", time: "14:01" },
  { id: mid(), author: "junho", text: "콜! 흑돼지는 꼭 먹자", time: "14:02" },
  { id: mid(), author: "minsu", text: "@봇 성산 근처 흑돼지 맛집 찾아줘", time: "14:03" },
  { id: mid(), author: "bot", kind: "places", payload: Scenario.search(), time: "14:03" },
  { id: mid(), author: "minsu", text: "돈사돈 담았어 — 다들 좋아요 눌러줘", time: "14:04" },
  { id: mid(), author: "jieun", text: "난 바다뷰 카페도 가고 싶어~", time: "14:05" },
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#1F8A5B",
  "panelSide": "right",
  "tabStyle": "pill",
  "panelDefault": "expanded"
}/*EDITMODE-END*/;

/* ---- 내 방 목록 (로비) ---- */
const INITIAL_ROOMS = [
  { id:"jeju", emoji:"🌋", dest:"제주 2박 3일", dates:"6.5(목)–6.7(토)", base:"성산 거점",
    members:["minsu","younghee","junho","jieun"], host:"younghee", confirmed:false,
    last:"민수: 돈사돈 담았어 — 다들 좋아요 눌러줘", lastTime:"방금", tint:"#E8F4ED" },
  { id:"busan", emoji:"🌃", dest:"부산 워크숍 1박 2일", dates:"7.12(토)–7.13(일)", base:"해운대 거점",
    members:["minsu","junho"], host:"junho", confirmed:false,
    last:"준호: 광안리 야경 코스부터 잡아보자", lastTime:"어제", tint:"#E3F0FA" },
  { id:"tongyeong", emoji:"⛵", dest:"통영 가족여행", dates:"8.2(토)–8.4(월)", base:"미정",
    members:["minsu","younghee","jieun"], host:"minsu", confirmed:false,
    last:"지은: 케이블카 꼭 타자~", lastTime:"3일 전", tint:"#F0E9FB" },
];

function freshMessages(room, joined) {
  const ms = [];
  if (joined) ms.push({ id: mid(), author: room.host, text: "어서 와! 후보부터 같이 담자", time: "방금" });
  ms.push({ id: mid(), author: "bot", kind: "bubble", time: "방금",
    text: `‘${room.dest}’ 방이 ${joined ? "열려 있어요" : "만들어졌어요"}. 여행지를 정하고 @봇으로 장소를 검색해 후보로 담아보세요. 후보가 모이면 “@봇 일정 짜줘”라고 불러 주세요.` });
  return ms;
}

/* 모바일 감지 */
function useIsMobile() {
  const [m, setM] = React.useState(() => window.matchMedia("(max-width: 760px)").matches);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return m;
}

function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  uE(() => { applyAccent(t.accent); }, [t.accent]);

  const [role, setRole] = uS("traveler");        // 내 시점 역할
  const [messages, setMessages] = uS(SEED_MESSAGES);
  const [candidates, setCandidates] = uS(SEED_CANDIDATES);
  const [itinerary, setItinerary] = uS(null);
  const [confirmed, setConfirmed] = uS(false);
  const [activeTab, setActiveTab] = uS("cand");
  const [collapsed, setCollapsed] = uS(false);
  const [selectedId, setSelectedId] = uS(null);    // 지도 포커스
  const [selectedStop, setSelectedStop] = uS(null);// 타임라인 선택
  const [detailId, setDetailId] = uS(null);        // 상세 팝업
  const [working, setWorking] = uS(false);
  const [workStep, setWorkStep] = uS(-1);
  const queueRef = uR([]);
  const workTimers = uR([]);
  const timeRef = uR(6);

  /* ---------- 방 / 뷰 라우팅 ---------- */
  const [view, setView] = uS("lobby");            // lobby | room
  const [rooms, setRooms] = uS(INITIAL_ROOMS);
  const [activeRoomId, setActiveRoomId] = uS("jeju");
  const [modal, setModal] = uS(null);             // null | create | join
  const roomStates = uR({ jeju: { messages: SEED_MESSAGES, candidates: SEED_CANDIDATES, itinerary: null, confirmed: false } });
  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  const isMobile = useIsMobile();
  const [mobileSheetOpen, setMobileSheetOpen] = uS(false);
  const openTab = (tab) => { setActiveTab(tab); if (isMobile) setMobileSheetOpen(true); else setCollapsed(false); };

  const nextTime = () => clock(timeRef.current++);
  const addMsg = (m) => setMessages((ms) => [...ms, { id: mid(), time: nextTime(), ...m }]);

  const addedIds = new Set(candidates.map((c) => c.id));

  /* ---------- 후보 액션 ---------- */
  const addCandidate = (id) => {
    setCandidates((cs) => cs.some((c) => c.id === id) ? cs : [...cs, { id, likes: [A_ME], dislikes: [] }]);
    openTab("cand");
  };
  const removeCandidate = (id) => setCandidates((cs) => cs.filter((c) => c.id !== id));

  /* 외부 링크로 후보 추가 (사용자 명시적 확인 → 방 전체 공유) */
  const addFromLink = (pv, cat) => {
    if (cat && window.TA_DATA.PLACES[pv.id]) window.TA_DATA.PLACES[pv.id].cat = cat;
    setCandidates((cs) => cs.some((c) => c.id === pv.id) ? cs : [...cs, { id: pv.id, likes: [A_ME], dislikes: [] }]);
    openTab("cand");
    addMsg({ author: A_ME, text: `‘${pv.name}’ 링크로 후보에 담았어요 — 다들 봐줘!` });
  };
  const toggleLike = (id) => setCandidates((cs) => cs.map((c) => {
    if (c.id !== id) return c;
    const on = c.likes.includes(A_ME);
    return { ...c, likes: on ? c.likes.filter((x) => x !== A_ME) : [...c.likes, A_ME], dislikes: c.dislikes.filter((x) => x !== A_ME) };
  }));
  const toggleDislike = (id) => setCandidates((cs) => cs.map((c) => {
    if (c.id !== id) return c;
    const on = c.dislikes.includes(A_ME);
    return { ...c, dislikes: on ? c.dislikes.filter((x) => x !== A_ME) : [...c.dislikes, A_ME], likes: c.likes.filter((x) => x !== A_ME) };
  }));

  const focusMap = (id) => { setSelectedId(id); setSelectedStop(id); openTab("map"); };
  const selectStop = (id) => { setSelectedStop(id); setSelectedId(id); };

  const setLodging = (id) => {
    const nm = window.TA_DATA.place(id).name;
    setItinerary((it) => it ? { ...it, days: it.days.map((d) => ({ ...d, lodging: id })) } : it);
    setSelectedId(id);
    addMsg({ author: "bot", kind: "bubble", text: `‘${nm}’을(를) 숙소로 지정했어요. 박별 숙소 슬롯과 숙소 기준 동선을 갱신했어요.` });
    if (itinerary) openTab("itin");
  };

  /* ---------- 작업(일정) 플로우 ---------- */
  const clearWorkTimers = () => { workTimers.current.forEach(clearTimeout); workTimers.current = []; };

  const finishWork = () => {
    setWorking(false); setWorkStep(-1);
    setMessages((ms) => ms.filter((m) => m.kind !== "working"));
    setItinerary(ITINERARY);
    addMsg({ author: "bot", kind: "itinerary" });
    openTab("itin");
    // 큐 처리
    const next = queueRef.current.shift();
    if (next) setTimeout(() => respond(next.intent, next.text), 600);
  };

  const startWork = () => {
    setWorking(true); setWorkStep(0);
    addMsg({ author: "bot", kind: "working" });
    clearWorkTimers();
    workTimers.current.push(setTimeout(() => setWorkStep(1), 1300));
    workTimers.current.push(setTimeout(() => setWorkStep(2), 2700));
    workTimers.current.push(setTimeout(() => finishWork(), 4100));
  };

  const cancelWork = () => {
    clearWorkTimers();
    setWorking(false); setWorkStep(-1);
    setMessages((ms) => ms.filter((m) => m.kind !== "working"));
    addMsg({ author: "bot", kind: "bubble", text: "작업을 취소했어요. 진행 중이던 일정 설계는 폐기했습니다. 다시 필요하면 /일정 으로 불러주세요." });
    queueRef.current = [];
  };

  /* ---------- 봇 응답 ---------- */
  const respond = (intent, text) => {
    switch (intent) {
      case "search":
        if (/스시|초밥|라멘|양식|파스타|함버거/.test(text || "")) { addMsg({ author: "bot", kind: "noresult", q: text }); break; }
        addMsg({ author: "bot", kind: "places", payload: Scenario.search() }); break;
      case "recommend": addMsg({ author: "bot", kind: "places", payload: Scenario.recommend() }); break;
      case "compare":   addMsg({ author: "bot", kind: "compare", payload: Scenario.compare() }); break;
      case "weather":   addMsg({ author: "bot", kind: "bubble", text: Scenario.weather().text }); break;
      case "itinerary":
        if (candidates.length === 0) { addMsg({ author: "bot", kind: "error", text: "담긴 후보가 없어 일정을 만들 수 없어요. 먼저 @봇으로 장소를 검색해 후보를 담아 주세요." }); break; }
        startWork(); break;
      case "modify":
        if (itinerary) {
          addMsg({ author: "bot", kind: "clarify", text: "‘우도’를 옮겨 달라는 거 맞죠? 어느 날로 옮길까요? 동선이 가장 매끄러운 건 둘째 날 오전이에요.",
            options: [
              { label: "둘째 날 오전으로", act: "move_udo_d2" },
              { label: "셋째 날로", act: "move_udo_d3" },
              { label: "그대로 둘게", act: "cancel" },
            ] });
        } else {
          addMsg({ author: "bot", kind: "bubble", text: "아직 작업 중 일정이 없어요. 먼저 /일정 으로 일정을 만들어 주세요." });
        }
        break;
      case "confirm":
        if (role === "host") {
          if (!itinerary) { addMsg({ author: "bot", kind: "bubble", text: "확정할 작업 중 일정이 없어요. 먼저 일정을 만들어 주세요." }); break; }
          setConfirmed(true);
          addMsg({ author: "bot", kind: "bubble", text: "일정을 확정했어요. 현재 작업본을 ‘확정 일정’으로 복제해 상단 요약 바와 일정 탭에 고정했어요. 작업본을 더 다듬어도 다시 확정하기 전까지 확정 일정은 그대로예요." });
          openTab("itin");
        } else {
          addMsg({ author: "bot", kind: "bubble", text: "확정은 방장만 할 수 있어요. 방장에게 확정을 요청해 주세요. (수정·추천은 누구나 가능해요)" });
        }
        break;
      default:
        addMsg({ author: "bot", kind: "bubble", text: "네! 방 맥락(제주·성산 거점·6/5~6/7)을 기준으로 도와드릴게요. ‘일정 짜줘 · 흑돼지 찾아줘 · 내일 날씨 · 카페 추천’처럼 말해 주세요." });
    }
  };

  const onClarifyPick = (opt) => {
    if (opt.act === "cancel") { addMsg({ author: "bot", kind: "bubble", text: "알겠어요, 일정은 그대로 둘게요." }); return; }
    // 우도를 둘째 날로 옮긴 새 작업본 (이미 둘째날이지만 데모: 시간 조정/카드 갱신)
    addMsg({ author: "minsu", text: opt.label });
    setItinerary((it) => ({ ...it, title: "제주 2박 3일 (작업본 · 수정됨)" }));
    setTimeout(() => addMsg({ author: "bot", kind: "itinerary" }), 500);
  };

  const pickCompare = (id) => {
    const nm = window.TA_DATA.place(id).name;
    setItinerary((it) => {
      if (!it) return it;
      const days = it.days.map((d, di) => di !== 1 ? d
        : { ...d, stops: d.stops.map((s) => (!s.move && /점심/.test(s.dur || "")) ? { ...s, id } : s) });
      return { ...it, days };
    });
    setSelectedId(id); setSelectedStop(id);
    addMsg({ author: "bot", kind: "bubble", text: `‘${nm}’으로 둘째 날 점심 슬롯을 바꿨어요. 일정·지도를 갱신했어요.` });
    openTab("itin");
  };

  /* ---------- 전송 ---------- */
  const onSend = (text, callsBot) => {
    addMsg({ author: A_ME, text });
    if (!callsBot) return;
    const intent = classifyIntent(text);
    if (working) {
      const label = intent === "itinerary" ? "새 일정 요청" : intent === "search" ? "장소 검색" : "봇 요청";
      addMsg({ author: "bot", kind: "queue", text: label });
      queueRef.current.push({ intent, text });
      return;
    }
    setTimeout(() => respond(intent, text), 450);
  };

  /* ---------- 방 전환 / 라우팅 ---------- */
  const saveActiveRoom = () => {
    roomStates.current[activeRoomId] = { messages, candidates, itinerary, confirmed };
  };
  const enterRoomDirect = (room, joined) => {
    if (view === "room") saveActiveRoom();
    if (!roomStates.current[room.id]) {
      roomStates.current[room.id] = { messages: freshMessages(room, joined), candidates: [], itinerary: null, confirmed: !!room.confirmed };
    }
    const st = roomStates.current[room.id];
    setMessages(st.messages); setCandidates(st.candidates); setItinerary(st.itinerary); setConfirmed(st.confirmed);
    setRole(room.host === A_ME ? "host" : "traveler");
    setActiveTab("cand"); setCollapsed(false); setSelectedId(null); setSelectedStop(null);
    setWorking(false); setWorkStep(-1); clearWorkTimers(); queueRef.current = [];
    setActiveRoomId(room.id); setView("room");
  };
  const enterRoom = (id) => { const r = rooms.find((x) => x.id === id); if (r) enterRoomDirect(r, false); };
  const switchRoom = (id) => { if (id === activeRoomId) return; enterRoom(id); };
  const goLobby = () => { saveActiveRoom(); setView("lobby"); };
  const createRoom = (room) => { setRooms((rs) => [room, ...rs]); setModal(null); enterRoomDirect(room, false); };
  const joinRoom = (room) => { setRooms((rs) => [room, ...rs]); setModal(null); enterRoomDirect(room, true); };
  const copyInvite = () => {
    const code = activeRoom.id.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6) || "JEJU9X";
    const link = `https://tourbot.app/invite/${code}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    try { navigator.clipboard && navigator.clipboard.writeText(link); } catch (e) {}
    addMsg({ author: "bot", kind: "bubble", text: `초대 링크를 복사했어요 — ${link}\n링크를 받은 사람은 ‘초대 링크로 입장’에서 이 방에 여행자로 참여할 수 있어요.` });
  };

  /* ---------- ctx ---------- */
  const ctx = {
    role, candidates, itinerary, confirmed, addedIds, selectedId, selectedStop, workStep,
    onAdd: addCandidate, onSetLodging: setLodging, onFocusMap: focusMap,
    onConfirm: () => respond("confirm"), onModify: () => respond("modify"),
    onSelectStop: selectStop, onPickCompare: pickCompare, onClarifyPick, onCancelWork: cancelWork,
  };

  const members = activeRoom.members.map((id) => A_MEM[id]).filter(Boolean);

  /* ===== 로비 화면 ===== */
  if (view === "lobby") {
    return (
      <>
        <window.LobbyScreen rooms={rooms} onEnter={enterRoom} onNew={() => setModal("create")} onJoin={() => setModal("join")}/>
        {modal === "create" && <window.CreateRoomModal onClose={() => setModal(null)} onCreate={createRoom}/>}
        {modal === "join" && <window.JoinRoomModal onClose={() => setModal(null)} onJoin={joinRoom}/>}
      </>
    );
  }

  /* ===== 방 안 (에이전트) 화면 ===== */
  return (
    <div className="app">
      {/* ── 상단 바 ── */}
      <div className="topbar">
        <window.RoomSwitcher rooms={rooms} activeId={activeRoomId} active={activeRoom}
          onSwitch={switchRoom} onLobby={goLobby} onNew={() => setModal("create")} onInvite={copyInvite} isHost={activeRoom.host === A_ME}/>
        <div className="room-meta" onClick={() => { if (isMobile) openTab("itin"); }} role={isMobile ? "button" : undefined}>
          <div className="title">{activeRoom.dest}
            {confirmed
              ? <span className="chip-confirmed"><AIcon.check s={12}/> 확정 일정</span>
              : <span className="chip-draft"><AIcon.edit s={11}/> 작업 중</span>}
            <AIcon.chevD s={15} className="mcaret"/>
          </div>
          <div className="sub">{activeRoom.dates} · {activeRoom.base} · 여행자 {activeRoom.members.length}</div>
        </div>
        <div className="spacer"></div>
        <div className="members">
          {members.slice(0, 4).map((m) => <span key={m.id} className="ava" style={{ background: m.color }} title={m.name}>{m.name[0]}</span>)}
          {activeRoom.members.length > 4 && <span className="more">+{activeRoom.members.length - 4}</span>}
        </div>
        <div className="divider"></div>
        <div className="role-toggle" title="내 시점 역할 전환 (프로토타입)">
          <button className={role === "traveler" ? "on" : ""} onClick={() => setRole("traveler")}><AIcon.user s={15}/> 여행자</button>
          <button className={"host " + (role === "host" ? "on host" : "")} onClick={() => setRole("host")}><AIcon.crown s={15}/> 방장</button>
        </div>
      </div>

      {/* ── 본문 ── */}
      <div className={"body" + (t.panelSide === "left" ? " panel-left" : "")}>
        <window.ChatArea
          messages={messages}
          ctx={ctx}
          composer={<window.Composer role={role} working={working} onSend={onSend}/>}
        />
        <window.SidePanel
          activeTab={activeTab} setActiveTab={setActiveTab}
          collapsed={isMobile ? false : collapsed} setCollapsed={setCollapsed}
          mobileOpen={isMobile && mobileSheetOpen} onCloseSheet={() => setMobileSheetOpen(false)}
          candidates={candidates} itinerary={itinerary} confirmed={confirmed} role={role}
          selectedId={selectedId} selectedStop={selectedStop}
          onToggleLike={toggleLike} onToggleDislike={toggleDislike} onRemove={removeCandidate}
          onAddLink={addFromLink} onOpenDetail={setDetailId}
          onFocusMap={focusMap} onSelect={focusMap} onSelectStop={selectStop}
          onConfirm={() => respond("confirm")}
          tabStyle={t.tabStyle} side={t.panelSide}
        />
        {isMobile && mobileSheetOpen && <div className="sheet-backdrop" onClick={() => setMobileSheetOpen(false)}></div>}
      </div>

      {/* ── 모바일 하단 탭 ── */}
      <div className="mobile-nav">
        {[{ id: "cand", label: "후보", icon: "pin" }, { id: "itin", label: "일정", icon: "calendar" }, { id: "map", label: "지도", icon: "map" }].map((tab) => {
          const Ico = AIcon[tab.icon];
          const on = mobileSheetOpen && activeTab === tab.id;
          return (
            <button key={tab.id} className={"mnav-btn" + (on ? " on" : "")} aria-label={tab.label}
              onClick={() => { if (mobileSheetOpen && activeTab === tab.id) setMobileSheetOpen(false); else { setActiveTab(tab.id); setMobileSheetOpen(true); } }}>
              <Ico s={20}/><span>{tab.label}</span>
              {tab.id === "cand" && candidates.length > 0 && <span className="nb">{candidates.length}</span>}
            </button>
          );
        })}
      </div>

      {/* ── 상세 팝업 ── */}
      {detailId && (
        <window.PlaceDetailModal
          place={window.TA_DATA.place(detailId)}
          cand={candidates.find((c) => c.id === detailId)}
          onClose={() => setDetailId(null)}
        />
      )}

      {/* ── 방 만들기 / 입장 ── */}
      {modal === "create" && <window.CreateRoomModal onClose={() => setModal(null)} onCreate={createRoom}/>}
      {modal === "join" && <window.JoinRoomModal onClose={() => setModal(null)} onJoin={joinRoom}/>}

      {/* ── Tweaks ── */}
      <window.TweaksPanel>
        <window.TweakSection label="패널 레이아웃"/>
        <window.TweakRadio label="패널 위치" value={t.panelSide}
          options={[{ value: "right", label: "오른쪽" }, { value: "left", label: "왼쪽" }]}
          onChange={(v) => setTweak("panelSide", v)}/>
        <window.TweakRadio label="탭 스타일" value={t.tabStyle}
          options={[{ value: "pill", label: "알약" }, { value: "underline", label: "밑줄" }]}
          onChange={(v) => setTweak("tabStyle", v)}/>
        <window.TweakSection label="브랜드"/>
        <window.TweakColor label="액센트" value={t.accent}
          options={["#1F8A5B", "#0E8C8C", "#2A7DE0", "#E0567B", "#E8962F"]}
          onChange={(v) => setTweak("accent", v)}/>
      </window.TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
