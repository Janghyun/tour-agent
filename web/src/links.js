// 장소의 외부 링크 — 출처에 맞는 지도로 보낸다.
// 네이버 결과의 place_url은 가게 예약 사이트(catchtable 등)라 네이버 지도가 아니므로,
// 네이버 태그는 항상 네이버 지도 검색으로 보낸다. 카카오·구글은 정확한 place_url을 우선.
// 주의: 카카오 새 지도(map.kakao.com)는 `?q=` 검색어를 무시하고 빈 홈만 띄운다(검색 안 됨).
// 그래서 place_url이 없는 경우(AI 추천 등)의 폴백은 실제로 검색되는 네이버 지도 검색을 쓴다.
export function placeLink(o) {
  const q = encodeURIComponent(o.name || "");
  if (o.source === "naver") return `https://map.naver.com/p/search/${q}`;
  if (o.source === "google") return o.place_url || `https://www.google.com/maps/search/?api=1&query=${q}`;
  return o.place_url || `https://map.naver.com/p/search/${q}`;
}
