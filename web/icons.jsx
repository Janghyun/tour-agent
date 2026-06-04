/* icons.jsx — 인라인 SVG 아이콘 세트 + 공통 헬퍼 (line style) */
const I = ({ d, s = 18, w = 1.8, fill = "none", children, ...p }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d ? <path d={d} /> : children}
  </svg>
);

const Icon = {
  bot: (p) => <I {...p}><rect x="4" y="8" width="16" height="11" rx="3.5"/><path d="M12 8V4M9 4h6"/><circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none"/></I>,
  send: (p) => <I {...p} d="M5 12h14M13 6l6 6-6 6"/>,
  plus: (p) => <I {...p} d="M12 5v14M5 12h14"/>,
  check: (p) => <I {...p} d="M5 12.5l4.5 4.5L19 6.5"/>,
  heart: (p) => <I {...p}><path d="M12 20s-7-4.6-9.2-9C1.3 7.7 3 5 6 5c1.9 0 3.2 1.1 4 2.3C10.8 6.1 12.1 5 14 5c3 0 4.7 2.7 3.2 6C19 15.4 12 20 12 20z"/></I>,
  heartFill: (p) => <I {...p} fill="currentColor" stroke="none"><path d="M12 20s-7-4.6-9.2-9C1.3 7.7 3 5 6 5c1.9 0 3.2 1.1 4 2.3C10.8 6.1 12.1 5 14 5c3 0 4.7 2.7 3.2 6C19 15.4 12 20 12 20z"/></I>,
  thumbDown: (p) => <I {...p}><path d="M7 14V4H4v10M7 14l3 6c1.3 0 2-.8 2-2v-3h4.5c1.2 0 2-1 1.7-2.2l-1.2-5C17.7 6.7 17 6 16 6H7"/></I>,
  trash: (p) => <I {...p} d="M5 7h14M10 7V5h4v2M6 7l1 12h10l1-12"/>,
  pin: (p) => <I {...p}><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></I>,
  pinFill: (p) => <I {...p} fill="currentColor" stroke="none"><path d="M12 22s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></I>,
  map: (p) => <I {...p}><path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z"/><path d="M9 4v13M15 6.5v13"/></I>,
  list: (p) => <I {...p} d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>,
  calendar: (p) => <I {...p}><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></I>,
  bed: (p) => <I {...p}><path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6M3 14h18M3 18v2M21 18v2M7 10V8a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0112 8v2"/></I>,
  search: (p) => <I {...p}><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></I>,
  x: (p) => <I {...p} d="M6 6l12 12M18 6L6 18"/>,
  chevR: (p) => <I {...p} d="M9 6l6 6-6 6"/>,
  chevL: (p) => <I {...p} d="M15 6l-6 6 6 6"/>,
  chevD: (p) => <I {...p} d="M6 9l6 6 6-6"/>,
  crown: (p) => <I {...p}><path d="M4 18h16M4 18l-1.5-9 5 3.5L12 6l4.5 6.5 5-3.5L20 18"/></I>,
  user: (p) => <I {...p}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></I>,
  walk: (p) => <I {...p}><circle cx="13" cy="4.5" r="1.6"/><path d="M11 21l1.5-6-2-2 1-5 3 2 2 1M9.5 13l1-3"/></I>,
  car: (p) => <I {...p}><path d="M5 16v2M19 16v2M3 13l2-5.5A2 2 0 017 6h10a2 2 0 011.9 1.5L21 13M3 13h18v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3z"/><circle cx="7.5" cy="13" r="0" fill="currentColor"/></I>,
  bus: (p) => <I {...p}><rect x="4" y="4" width="16" height="13" rx="2.5"/><path d="M4 12h16M8 17v2M16 17v2M7.5 4v8M16.5 4v8"/></I>,
  clock: (p) => <I {...p}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></I>,
  sun: (p) => <I {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></I>,
  rain: (p) => <I {...p}><path d="M7 16a4.5 4.5 0 01-.5-9 5.5 5.5 0 0110.6-1A4 4 0 0117 16"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/></I>,
  sparkle: (p) => <I {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></I>,
  cancel: (p) => <I {...p}><circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/></I>,
  swap: (p) => <I {...p} d="M7 4L4 7l3 3M4 7h11M17 20l3-3-3-3M20 17H9"/>,
  edit: (p) => <I {...p} d="M16 4l4 4L8 20H4v-4L16 4z"/>,
  flag: (p) => <I {...p} d="M5 21V4M5 4h11l-2 3.5L16 11H5"/>,
  layers: (p) => <I {...p}><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 16.5l9 5 9-5"/></I>,
  arrowUp: (p) => <I {...p} d="M12 19V5M6 11l6-6 6 6"/>,
};
window.Icon = Icon;
