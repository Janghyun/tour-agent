/* 로비 보조 저장소 — 백엔드에 방 목록 API가 없어 "내 방"을 브라우저(localStorage)에 보관한다.
 * 방 자체는 백엔드에서 /ws/{room_id} 첫 연결 시 생성되므로, 여기 목록은 재입장용 바로가기일 뿐이다. */

const ME_KEY = "ta_me";
const ROOMS_KEY = "ta_rooms";

const _ls = () => (typeof localStorage !== "undefined" ? localStorage : null);

export function loadMe() {
  return _ls()?.getItem(ME_KEY) || "";
}
export function saveMe(name) {
  _ls()?.setItem(ME_KEY, name);
}

export function loadRooms() {
  try {
    return JSON.parse(_ls()?.getItem(ROOMS_KEY) || "[]");
  } catch {
    return [];
  }
}

/* 방을 최근 목록 맨 앞에 올린다(같은 id면 갱신). */
export function rememberRoom(room) {
  const rooms = loadRooms().filter((r) => r.id !== room.id);
  rooms.unshift({ ...room, lastSeen: room.lastSeen || "" });
  _ls()?.setItem(ROOMS_KEY, JSON.stringify(rooms.slice(0, 12)));
}

export function forgetRoom(id) {
  _ls()?.setItem(ROOMS_KEY, JSON.stringify(loadRooms().filter((r) => r.id !== id)));
}

/* 채팅 메시지(사람 대화 + 봇 카드)를 방별로 보관 — 새로고침 시 내 화면 복원용.
 * 방 상태(후보·일정)는 백엔드(Supabase) 영속이지만, 채팅 흐름은 클라이언트 메모리뿐이라 사라진다. */
export function loadMsgs(room) {
  try {
    return JSON.parse(_ls()?.getItem("ta_msgs_" + room) || "[]");
  } catch {
    return [];
  }
}
export function saveMsgs(room, msgs) {
  try {
    _ls()?.setItem("ta_msgs_" + room, JSON.stringify(msgs.slice(-120)));
  } catch {
    /* 용량 초과 등은 무시 */
  }
}

/* 내보낸 일정 HTML 보관(history) — 방별, 나중에 다시 보기. */
export function loadHistory(room) {
  try {
    return JSON.parse(_ls()?.getItem("ta_history_" + room) || "[]");
  } catch {
    return [];
  }
}
export function saveHistoryEntry(room, entry) {
  const list = loadHistory(room);
  list.unshift(entry);
  try {
    _ls()?.setItem("ta_history_" + room, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* 용량 초과 무시 */
  }
}
export function removeHistory(room, ts) {
  try {
    _ls()?.setItem("ta_history_" + room, JSON.stringify(loadHistory(room).filter((e) => e.ts !== ts)));
  } catch {
    /* 무시 */
  }
}

const _ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/* 사람이 읽고 부르기 쉬운 방 코드(혼동 글자 제외). seed로 결정적 생성(테스트·SSR 안전). */
export function makeRoomCode(seed) {
  let n = 0;
  const s = String(seed ?? "");
  for (const ch of s) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += _ALPHABET[n % _ALPHABET.length];
    n = Math.floor(n / _ALPHABET.length) + (i + 1) * 7;
  }
  return code;
}
