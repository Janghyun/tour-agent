/* mapmodal.jsx — 일정 동선을 실제 지도(OpenStreetMap) 위에 크게 보여주는 확대 모달.
 * leaflet은 브라우저 전용이라 이 모듈은 lazy import로만 로드된다(SSR 안전). */
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CAT, catKey } from "./constants.js";

function numIcon(n, color) {
  return L.divIcon({
    className: "itin-num-pin",
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};color:#fff;font-weight:800;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.35);font-size:13px">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function Fit({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 1) map.setView(positions[0], 13);
    else if (positions.length > 1) map.fitBounds(positions, { padding: [40, 40] });
  }, []); // eslint-disable-line
  return null;
}

export default function MapModal({ stops, title, onClose }) {
  const pts = (stops || [])
    .filter((s) => s.x && s.y)
    .map((s) => ({ name: s.name, lat: +s.y, lng: +s.x, cat: catKey(s.category), place_url: s.place_url }));
  const positions = pts.map((p) => [p.lat, p.lng]);
  const center = positions[0] || [33.38, 126.55];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,18,15,.5)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(900px, 96vw)", height: "min(80vh, 720px)", background: "var(--surface)", borderRadius: "var(--r)", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "var(--sh-2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
          <strong style={{ fontSize: 14, flex: 1 }}>{title || "동선 지도"}</strong>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>번호 = 방문 순서 · 핀을 누르면 장소</span>
          <button onClick={onClose} aria-label="닫기" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {positions.length === 0 ? (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 13, padding: 20, textAlign: "center" }}>
              좌표가 있는 장소가 없어 지도를 표시할 수 없어요.
            </div>
          ) : (
            <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {positions.length > 1 && (
                <Polyline positions={positions} pathOptions={{ color: "#1F8A5B", weight: 3, dashArray: "6 8" }} />
              )}
              {pts.map((p, i) => (
                <Marker key={i} position={[p.lat, p.lng]} icon={numIcon(i + 1, (CAT[p.cat] || CAT.sight).bg)}>
                  <Tooltip direction="top" offset={[0, -14]}>{i + 1}. {p.name}</Tooltip>
                </Marker>
              ))}
              <Fit positions={positions} />
            </MapContainer>
          )}
        </div>
      </div>
    </div>
  );
}
