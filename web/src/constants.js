// 카테고리 시각 스타일 + 백엔드 카테고리 문자열 → 디자인 분류 키 정규화.
export const CAT = {
  food: { label: "맛집", emoji: "🍖", bg: "#FF7A59", pill: "#FFEDE6", pinkText: "#C2502F" },
  cafe: { label: "카페", emoji: "☕", bg: "#E8962F", pill: "#FCF1DF", pinkText: "#9A6411" },
  sight: { label: "명소", emoji: "⛰️", bg: "#1F8A5B", pill: "#E8F4ED", pinkText: "#16744B" },
  nature: { label: "자연", emoji: "🌊", bg: "#2F86C7", pill: "#E3F0FA", pinkText: "#1E6BA8" },
  activity: { label: "체험", emoji: "🛶", bg: "#9B6FE0", pill: "#F0E9FB", pinkText: "#6E47B8" },
  lodging: { label: "숙소", emoji: "🛏️", bg: "#E0567B", pill: "#FCE7EE", pinkText: "#B83A5C" },
};

// Kakao 등 자유 텍스트 카테고리("음식점 > 한식" 등)를 디자인 분류 키로 정규화.
export function catKey(category = "") {
  const c = String(category);
  if (/카페|커피|cafe|디저트|베이커리|빵/i.test(c)) return "cafe";
  if (/숙소|호텔|펜션|게스트|리조트|민박|모텔/i.test(c)) return "lodging";
  if (/음식|맛집|식당|한식|고기|국수|해장|전복|회|중식|일식|양식|분식|뷔페/i.test(c)) return "food";
  if (/체험|액티비티|아쿠아|테마|박물|미술|전시|공원/i.test(c)) return "activity";
  if (/해변|해수욕|바다|섬|오름|숲|자연|폭포|해안/i.test(c)) return "nature";
  return "sight";
}

export const SLASH = [
  { k: "/일정", d: "후보로 동선·숙소 고려해 일정 생성·수정" },
  { k: "/추천", d: "방 맥락에 맞는 장소 추천" },
  { k: "/검색", d: "키워드로 장소 검색 → 옵션 카드" },
  { k: "/비교", d: "한 슬롯의 대안 2~3개 비교" },
  { k: "/확정", d: "작업 중 일정을 확정 일정으로", host: true },
];

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt,
    g = ((n >> 8) & 255) + amt,
    b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
