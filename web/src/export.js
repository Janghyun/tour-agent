/* export.js — 확정 일정을 자체완결 HTML로. 다운로드/인쇄(PDF)·history 저장에 쓴다. */

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function itineraryToHtml(card, meta = {}) {
  const days = card.days || [];
  const title = card.title || meta.dest || "여행 일정";
  const sub = meta.dates || "";
  const daysHtml = days
    .map((d, di) => {
      const items = (d.items || [])
        .map((it, ii) => {
          const link = it.place_url
            ? ` <a href="${esc(it.place_url)}" target="_blank" rel="noreferrer">지도</a>`
            : ` <a href="https://map.kakao.com/?q=${encodeURIComponent(it.name || "")}" target="_blank" rel="noreferrer">지도</a>`;
          const cat = it.category ? ` <span class="cat">${esc(it.category)}</span>` : "";
          const sub2 = it.travel_from_prev ? `<div class="sub">${esc(it.travel_from_prev)}</div>` : "";
          return `<li><span class="num">${ii + 1}</span><div class="it"><div><span class="t">${esc(it.time || "")}</span> <b>${esc(it.name)}</b>${cat}${link}</div>${sub2}</div></li>`;
        })
        .join("");
      const acc = d.accommodation ? ` <span class="acc">· 숙소 ${esc(d.accommodation)}</span>` : "";
      return `<section><h2><span class="dn">${di + 1}</span>${esc(d.date || `Day ${di + 1}`)}${acc}</h2><ol>${items}</ol></section>`;
    })
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--g:#1F8A5B}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard",Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:28px 20px 60px;color:#2B2722;line-height:1.5}
header{border-bottom:2px solid var(--g);padding-bottom:12px;margin-bottom:18px}
h1{font-size:24px;margin:0 0 4px;letter-spacing:-.02em}
.meta{color:#7a756c;font-size:14px;margin:0}
section{margin:20px 0}
h2{font-size:16px;margin:0 0 8px;display:flex;align-items:center;gap:8px}
.dn{width:22px;height:22px;border-radius:50%;background:var(--g);color:#fff;font-size:12px;font-weight:800;display:inline-grid;place-items:center}
.acc{font-weight:500;color:#7a756c;font-size:13px}
ol{list-style:none;margin:0;padding:0}
li{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #efeae0}
.num{flex:none;width:20px;height:20px;border-radius:50%;background:#E8F4ED;color:#16744B;font-size:11px;font-weight:800;display:grid;place-items:center;margin-top:2px}
.t{color:var(--g);font-weight:700;margin-right:4px}
.cat{font-size:12px;color:#9a958c;background:#f3f0e9;border-radius:8px;padding:1px 6px}
.sub{font-size:12px;color:#9a958c;margin-top:2px}
a{color:var(--g);text-decoration:none;font-size:12.5px;border:1px solid #d8e8df;border-radius:7px;padding:1px 7px}
footer{margin-top:28px;color:#b3aea4;font-size:12px;text-align:center}
@media print{a{border:none;color:#555}body{padding:0}}
</style></head>
<body>
<header><h1>${esc(title)}</h1><p class="meta">${esc(sub)}</p></header>
${daysHtml}
<footer>여행봇으로 만든 일정 · 영업시간·휴무는 방문 전 확인하세요</footer>
</body></html>`;
}

/* HTML 문자열을 파일로 내려받기 */
export function downloadHtml(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (filename || "여행일정") + ".html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* HTML 문자열을 새 탭으로 열기(인쇄→PDF, 또는 history 보기) */
export function openHtml(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
