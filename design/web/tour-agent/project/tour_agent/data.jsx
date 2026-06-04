/* data.jsx — 시드 데이터: 멤버 · 장소 풀 · 카테고리 · 봇 시나리오 · 지도 좌표 */

/* ---- 멤버 ---- */
const MEMBERS = {
  minsu:  { id: "minsu",  name: "민수", color: "#1F8A5B", role: "traveler" },
  younghee:{ id: "younghee", name: "영희", color: "#FF7A59", role: "host" },
  junho:  { id: "junho",  name: "준호", color: "#2F86C7", role: "traveler" },
  jieun:  { id: "jieun",  name: "지은", color: "#9B6FE0", role: "traveler" },
};
const ME = "minsu";

/* ---- 카테고리 색/이모지 ---- */
const CAT = {
  food:    { label: "흑돼지·맛집", emoji: "🍖", bg: "#FF7A59", pill: "#FFEDE6", pinkText: "#C2502F" },
  cafe:    { label: "카페",       emoji: "☕", bg: "#E8962F", pill: "#FCF1DF", pinkText: "#9A6411" },
  sight:   { label: "명소",       emoji: "⛰️", bg: "#1F8A5B", pill: "#E8F4ED", pinkText: "#16744B" },
  nature:  { label: "자연",       emoji: "🌊", bg: "#2F86C7", pill: "#E3F0FA", pinkText: "#1E6BA8" },
  activity:{ label: "체험",       emoji: "🛶", bg: "#9B6FE0", pill: "#F0E9FB", pinkText: "#6E47B8" },
  lodging: { label: "숙소",       emoji: "🛏️", bg: "#E0567B", pill: "#FCE7EE", pinkText: "#B83A5C" },
};

/* ---- 장소 마스터 (지도 좌표 = 제주 스타일 맵 viewBox 0..600 x 0..420) ---- */
const PLACES = {
  seongsan:   { id:"seongsan",  name:"성산일출봉",   cat:"sight",  meta:"유네스코 세계자연유산", dist:"숙소 1.2km", x:498, y:196, note:"이른 아침 일출 명소. 정상까지 약 30분." },
  udo:        { id:"udo",       name:"우도",         cat:"nature", meta:"배 15분 · 섬 일주",     dist:"성산항 도선", x:548, y:150, note:"성산항에서 도항선. 자전거·전기차 일주 추천." },
  donsadon:   { id:"donsadon",  name:"돈사돈",       cat:"food",   meta:"흑돼지 근고기 · ★4.6",  dist:"성산 0.8km",  x:470, y:214, note:"제주 흑돼지 근고기 노포. 웨이팅 잦음." },
  ureukdo:    { id:"ureukdo",   name:"우진해장국",   cat:"food",   meta:"고사리 육개장 · ★4.5",  dist:"성산 1.5km",  x:452, y:230, note:"아침 식사로 인기. 진한 고사리 육개장." },
  myeongjin:  { id:"myeongjin", name:"명진전복",     cat:"food",   meta:"전복돌솥밥 · ★4.4",     dist:"성산 2.1km",  x:512, y:236, note:"전복돌솥밥·구이. 바다 전망." },
  bomnal:     { id:"bomnal",    name:"카페 봄날",     cat:"cafe",   meta:"바다뷰 · 드라마 촬영지", dist:"성산 1.0km",  x:486, y:252, note:"애월 바다뷰 카페. 통창 좌석." },
  hwadam:     { id:"hwadam",    name:"화담숲 카페",   cat:"cafe",   meta:"디저트 · 조용함",       dist:"성산 1.8km",  x:460, y:258, note:"숲 한가운데 조용한 카페." },
  seopjikoji: { id:"seopjikoji",name:"섭지코지",     cat:"sight",  meta:"해안 산책로 · 등대",    dist:"성산 4.0km",  x:524, y:236, note:"해안 절경 산책로. 올인하우스." },
  hamdeok:    { id:"hamdeok",   name:"함덕해수욕장", cat:"nature", meta:"에메랄드 해변",         dist:"공항 25km",   x:362, y:120, note:"맑은 에메랄드빛 해변. 서우봉 산책." },
  pension:    { id:"pension",   name:"성산 오션뷰 펜션", cat:"lodging", meta:"4인 · 오션뷰",      dist:"성산항 0.5km", x:482, y:230, note:"성산항 인근. 일출봉 도보권." },
  airport:    { id:"airport",   name:"제주국제공항", cat:"nature", meta:"렌터카 픽업",           dist:"—",          x:212, y:150, note:"여행 시작점." },
};

const place = (id) => PLACES[id];

/* ---- 초기 후보 풀 ---- */
const SEED_CANDIDATES = [
  { id:"seongsan", likes:["younghee","minsu"], dislikes:[] },
  { id:"udo",      likes:["jieun"],            dislikes:[] },
  { id:"donsadon", likes:["junho","minsu"],    dislikes:[] },
];

/* ---- 봇 시나리오: 슬래시 커맨드 사전 ---- */
const SLASH = [
  { k:"/일정",  d:"후보로 동선·숙소 고려해 일정 생성·수정", host:false },
  { k:"/추천",  d:"방 맥락에 맞는 장소 추천", host:false },
  { k:"/검색",  d:"키워드로 장소 검색 → 옵션 카드", host:false },
  { k:"/비교",  d:"한 슬롯의 대안 2~3개 비교", host:false },
  { k:"/확정",  d:"작업 중 일정을 확정 일정으로", host:true },
];

/* ---- 입력 의도 분류 ---- */
function classifyIntent(text) {
  const t = text.trim();
  if (/^\/확정/.test(t) || /확정/.test(t)) return "confirm";
  if (/^\/비교/.test(t) || /비교/.test(t)) return "compare";
  if (/^\/일정/.test(t) || /일정.*(짜|만들|생성|짤|구성)/.test(t)) return "itinerary";
  if (/(옮겨|바꿔|수정|빼줘|넣어|변경|당겨|미뤄)/.test(t)) return "modify";
  if (/^\/검색/.test(t) || /(흑돼지|맛집|식당|먹|점심|저녁|회|해장)/.test(t)) return "search";
  if (/^\/추천/.test(t) || /(추천|카페|가볼|명소|뭐.*있)/.test(t)) return "recommend";
  if (/(비|날씨|더워|추워|몇.*도|우산)/.test(t)) return "weather";
  return "chat";
}

/* ---- 봇 응답 빌더 (카드 페이로드) ---- */
const Scenario = {
  search: () => ({
    kind: "places",
    title: "성산 근처 흑돼지·맛집",
    subtitle: "검색 결과 3곳",
    tag: "검색",
    items: ["donsadon", "ureukdo", "myeongjin"],
  }),
  recommend: () => ({
    kind: "places",
    title: "성산에서 가볼 만한 곳",
    subtitle: "지은님의 ‘카페 선호’ 반영 · 추천 3곳",
    tag: "추천",
    items: ["seopjikoji", "bomnal", "udo"],
  }),
  compare: () => ({
    kind: "compare",
    title: "점심 식당 대안",
    subtitle: "둘째 날 12:30 슬롯 · 3개 중 택1",
    slot: "둘째 날 점심",
    items: ["donsadon", "ureukdo", "myeongjin"],
  }),
  weather: () => ({
    kind: "bubble",
    text: "내일(6/5) 성산 지역은 오전 흐림, 오후 한때 비 소식이에요 ☔️ 강수확률 60%. 우도행 도선은 오전 운항이 더 안전해요. 일출봉은 우천 시 미끄러우니 오전 일정으로 당기는 걸 추천!",
  }),
};

/* ---- 초기 일정 (작업 중) — 시나리오 B 후 생성될 결과 ---- */
const ITINERARY = {
  status: "draft", // draft | confirmed
  title: "제주 2박 3일 (작업본)",
  days: [
    {
      label: "Day 1", date: "6월 5일 (목)",
      lodging: "pension",
      stops: [
        { id:"seongsan",  time:"09:00", dur:"1시간 30분" },
        { move:{ mins:8,  mode:"car" } },
        { id:"donsadon",  time:"12:00", dur:"점심" },
        { move:{ mins:6,  mode:"car" } },
        { id:"bomnal",    time:"14:30", dur:"카페" },
        { move:{ mins:10, mode:"car" } },
        { id:"seopjikoji",time:"16:00", dur:"산책 1시간" },
      ],
    },
    {
      label: "Day 2", date: "6월 6일 (금)",
      lodging: "pension",
      stops: [
        { id:"ureukdo",  time:"08:30", dur:"아침" },
        { move:{ mins:12, mode:"car" } },
        { id:"udo",      time:"10:30", dur:"섬 일주 3시간" },
        { move:{ mins:15, mode:"bus" } },
        { id:"myeongjin",time:"13:30", dur:"점심" },
      ],
    },
  ],
};

/* ---- 외부 링크로 등록 가능한 장소 풀 (붙여넣기 미리보기 시뮬레이션) ---- */
const EXTERNAL_POOL = [
  { id:"gwangchigi", name:"광치기해변",       cat:"nature",   meta:"에메랄드 여울 · 일출 명소", dist:"성산 1.3km", x:455, y:206, address:"서귀포시 성산읍 고성리 224-33", note:"썰물 때 드러나는 이끼 암반과 에메랄드빛 여울." },
  { id:"aqua",       name:"아쿠아플라넷 제주", cat:"activity", meta:"아시아 최대 아쿠아리움",   dist:"성산 2.5km", x:518, y:248, address:"성산읍 섭지코지로 95", note:"실내 대형 아쿠아리움. 우천·더위 대비 코스." },
  { id:"snoopy",     name:"스누피가든",        cat:"activity", meta:"테마가든 · 실내외 전시",   dist:"성산 6.0km", x:432, y:176, address:"제주시 구좌읍 금백조로 930", note:"스누피 테마 정원·카페. 아이·연인 인기." },
  { id:"ojiseo",     name:"오저상회 카페",      cat:"cafe",     meta:"감귤밭 뷰 · 베이커리",     dist:"성산 3.0km", x:476, y:268, address:"성산읍 난산리 1421", note:"감귤밭을 낀 통창 베이커리 카페." },
  { id:"gasiri",     name:"가시리 고기국수",    cat:"food",     meta:"고기국수 · ★4.5",          dist:"성산 5.0km", x:420, y:282, address:"표선면 가시리 1929", note:"진한 돼지뼈 육수 고기국수. 현지인 맛집." },
];
let _extIdx = 0;

/* URL에서 출처 도메인 추출 */
function linkSource(url) {
  try {
    const h = new URL(/^https?:\/\//.test(url) ? url : "https://" + url).hostname.replace(/^www\./, "");
    const map = { "naver.me":"네이버 지도", "map.naver.com":"네이버 지도", "place.map.kakao.com":"카카오맵", "kko.to":"카카오맵", "instagram.com":"인스타그램", "blog.naver.com":"네이버 블로그", "youtube.com":"유튜브", "youtu.be":"유튜브" };
    return { host: h, label: map[h] || h };
  } catch (e) { return { host: "link", label: "공유 링크" }; }
}

/* 링크 → 장소 미리보기 (키워드 매칭 후 폴백은 순환) */
function parseLink(url) {
  const t = (url || "").toLowerCase();
  let pick;
  if (/해변|beach|gwang|광치기/.test(t)) pick = EXTERNAL_POOL[0];
  else if (/아쿠아|aqua|aquarium/.test(t)) pick = EXTERNAL_POOL[1];
  else if (/스누피|snoopy|garden|가든/.test(t)) pick = EXTERNAL_POOL[2];
  else if (/카페|cafe|coffee|커피|베이커리/.test(t)) pick = EXTERNAL_POOL[3];
  else if (/국수|맛집|food|고기|noodle/.test(t)) pick = EXTERNAL_POOL[4];
  else { pick = EXTERNAL_POOL[_extIdx % EXTERNAL_POOL.length]; _extIdx++; }
  // 런타임에 장소 등록 (지도·후보에서 place(id)로 참조)
  if (!PLACES[pick.id]) PLACES[pick.id] = { ...pick };
  return { ...pick, source: linkSource(url) };
}

window.TA_DATA = { MEMBERS, ME, CAT, PLACES, place, SEED_CANDIDATES, SLASH, classifyIntent, Scenario, ITINERARY, parseLink, linkSource };
