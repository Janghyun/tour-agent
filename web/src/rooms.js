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
