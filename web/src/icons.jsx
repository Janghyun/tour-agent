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
  user: (p) => <I {...p}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6"/></I>,
  edit: (p) => <I {...p} d="M4 20h4L18.5 9.5a2 2 0 00-3-3L5 17v3z"/>,
  list: (p) => <I {...p} d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>,
  chevD: (p) => <I {...p} d="M6 9l6 6 6-6"/>,
  chevR: (p) => <I {...p} d="M9 6l6 6-6 6"/>,
  chevL: (p) => <I {...p} d="M15 6l-6 6 6 6"/>,
  search: (p) => <I {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></I>,
  heart: (p) => <I {...p} d="M12 20s-7-4.6-9.2-9C1.3 8 3 4.5 6.3 4.5c2 0 3.2 1.2 3.7 2 .5-.8 1.7-2 3.7-2C17 4.5 18.7 8 17.2 11 15 15.4 12 20 12 20z"/>,
  heartFill: (p) => <I {...p} fill="currentColor" stroke="none" d="M12 20s-7-4.6-9.2-9C1.3 8 3 4.5 6.3 4.5c2 0 3.2 1.2 3.7 2 .5-.8 1.7-2 3.7-2C17 4.5 18.7 8 17.2 11 15 15.4 12 20 12 20z"/>,
  thumbDown: (p) => <I {...p} d="M7 4h9l3 8h-4v6a2 2 0 01-2 2l-3-7H7a2 2 0 01-2-2V6a2 2 0 012-2z"/>,
  flag: (p) => <I {...p} d="M5 21V4M5 4h11l-2 4 2 4H5"/>,
};
