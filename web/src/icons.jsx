/* 인라인 SVG 아이콘 세트 (line style) — 디자인 프로토타입에서 포팅(ESM). */
const I = ({ d, s = 18, w = 1.8, fill = "none", children, ...p }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);

export const Icon = {
  bot: (p) => <I {...p}><rect x="4" y="8" width="16" height="11" rx="3.5"/><path d="M12 8V4M9 4h6"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none"/></I>,
  send: (p) => <I {...p} d="M5 12h14M13 6l6 6-6 6"/>,
  plus: (p) => <I {...p} d="M12 5v14M5 12h14"/>,
  check: (p) => <I {...p} d="M5 12.5l4.5 4.5L19 6.5"/>,
  pin: (p) => <I {...p}><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></I>,
  map: (p) => <I {...p}><path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z"/><path d="M9 4v13M15 6.5v13"/></I>,
  calendar: (p) => <I {...p}><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></I>,
  trash: (p) => <I {...p} d="M5 7h14M10 7V5h4v2M6 7l1 12h10l1-12"/>,
  x: (p) => <I {...p} d="M6 6l12 12M18 6L6 18"/>,
  crown: (p) => <I {...p}><path d="M4 18h16M4 18l-1.5-9 5 3.5L12 6l4.5 6.5 5-3.5L20 18"/></I>,
};
