/* mapcanvas.jsx — 후보·숙소를 실제 지도(OpenStreetMap) 위에 핀으로 보여주는 인라인 지도.
 * leaflet은 브라우저 전용이라 이 모듈은 lazy import로만 로드된다(SSR 안전). */
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CAT, catKey } from "./constants.js";

function pinIcon(color, sel, isLodge) {
  const w = sel ? 36 : 30, h = sel ? 45 : 38;
  const glyph = isLodge
    ? `<text x="17" y="19" text-anchor="middle" font-size="13" fill="#fff">🛏</text>`
    : `<circle cx="17" cy="14" r="5.5" fill="#fff" />`;
  return L.divIcon({
    className: "cand-pin",
    html: `<svg width="${w}" height="${h}" viewBox="0 0 34 42"><path d="M17 41C17 41 32 24 32 14A15 15 0 1 0 2 14C2 24 17 41 17 41Z" fill="${color}" stroke="#fff" stroke-width="2.5"/>${glyph}</svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
}

function Fit({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 1) map.setView(positions[0], 12);
    else if (positions.length > 1) map.fitBounds(positions, { padding: [50, 50] });
  }, []); // eslint-disable-line
  return null;
}

// 후보의 '지도에서 보기'로 선택이 바뀌면 해당 핀으로 부드럽게 이동.
function Focus({ pts, selectedId }) {
  const map = useMap();
  useEffect(() => {
    const p = pts.find((x) => x.id === selectedId);
    if (p) map.panTo([p.lat, p.lng]);
  }, [selectedId]); // eslint-disable-line
  return null;
}

// 패널 크기 변경(드래그)·탭 전환 시 타일이 깨지지 않게 크기를 다시 계산.
function Resizer() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 0);
    let ro;
    const el = map.getContainer();
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(el);
    }
    return () => { clearTimeout(t); if (ro) ro.disconnect(); };
  }, []); // eslint-disable-line
  return null;
}

export default function MapCanvas({ candidates = [], accommodations = [], selectedId = null, onSelect = () => {} }) {
  const pts = [];
  candidates.forEach((c) => {
    if (c.x && c.y) pts.push({ id: c.id, name: c.name, lat: +c.y, lng: +c.x, cat: catKey(c.category) });
  });
  accommodations.forEach((a, i) => {
    if (a.x && a.y) pts.push({ id: "acc" + i, name: a.name, lat: +a.y, lng: +a.x, cat: "lodging", isLodge: true });
  });
  const positions = pts.map((p) => [p.lat, p.lng]);
  const center = positions[0] || [33.38, 126.55];

  if (positions.length === 0) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 13, padding: 20, textAlign: "center" }}>
        좌표가 있는 후보가 없어요. Kakao 검색으로 담은 장소가 지도에 표시됩니다.
      </div>
    );
  }
  return (
    <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {pts.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon((CAT[p.cat] || CAT.sight).bg, selectedId === p.id, p.isLodge)}
          eventHandlers={{ click: () => onSelect(p.id) }}
        >
          <Tooltip direction="top" offset={[0, -32]}>{p.name}{p.isLodge ? " (숙소)" : ""}</Tooltip>
        </Marker>
      ))}
      <Fit positions={positions} />
      <Focus pts={pts} selectedId={selectedId} />
      <Resizer />
    </MapContainer>
  );
}
