"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { MapMarker, LiveMapProps } from "./LiveMap";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function iconFor(m: MapMarker) {
  const cls =
    m.kind === "you" ? "pin pin-you"
    : m.kind === "mech" ? `pin pin-mech${m.label ? "" : " amber"}`
    : m.kind === "incident" ? "pin pin-incident"
    : "pin pin-small";
  const size = m.kind === "mech" ? 30 : m.kind === "incident" ? (m.selected ? 30 : 22) : m.kind === "you" ? 20 : 14;
  const style = [
    m.color ? `background:${m.color}` : "",
    m.kind === "incident" ? `width:${size}px;height:${size}px` : "",
    m.selected ? "box-shadow:0 0 0 6px rgba(14,26,43,.18),0 1px 4px rgba(0,0,0,.35)" : "",
  ].join(";");
  return L.divIcon({
    className: "",
    html: `<div class="${cls}" style="${style}">${m.kind === "mech" && m.label ? m.label : ""}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function Fit({ points, padding }: { points: [number, number][]; padding: number }) {
  const map = useMap();
  const key = points.map((p) => p.map((v) => v.toFixed(4)).join(",")).join("|");
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 14), { animate: false });
    else map.fitBounds(L.latLngBounds(points), { padding: [padding, padding], maxZoom: 15, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, padding]);
  return null;
}

export default function LiveMapInner({ markers, route, accuracy, lines, circles, fitTo, interactive = true, padding = 40, ariaLabel }: LiveMapProps) {
  const center = useMemo<[number, number]>(() => (markers[0] ? [markers[0].lat, markers[0].lng] : [26.9124, 75.7873]), [markers]);
  const fit = (fitTo ?? markers).map((m) => [m.lat, m.lng] as [number, number]);
  return (
    <MapContainer center={center} zoom={13} zoomControl={interactive} scrollWheelZoom={false} dragging={interactive}
      doubleClickZoom={interactive} touchZoom={interactive} attributionControl style={{ width: "100%", height: "100%" }}
      aria-label={ariaLabel} keyboard={interactive}>
      <TileLayer url={TILE_URL} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      {accuracy && (
        <Circle center={[accuracy.lat, accuracy.lng]} radius={accuracy.radius}
          pathOptions={{ color: "#1F5FD6", weight: 1.5, opacity: 0.4, fillColor: "#1F5FD6", fillOpacity: 0.12 }} />
      )}
      {lines?.map((l) => (
        <Polyline key={l.id} positions={l.positions} pathOptions={{ color: l.color, weight: l.weight ?? 6, opacity: 0.9, dashArray: l.dash }}>
          {l.label && <Tooltip sticky>{l.label}</Tooltip>}
        </Polyline>
      ))}
      {circles?.map((c) => (
        <Circle key={c.id} center={[c.lat, c.lng]} radius={c.radius} pathOptions={{ color: c.color, weight: 0, fillColor: c.color, fillOpacity: 0.22 }}>
          {c.label && <Tooltip>{c.label}</Tooltip>}
        </Circle>
      ))}
      {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#0E1A2B", weight: 5, opacity: 0.85 }} />}
      {markers.map((m) => (
        <Marker key={m.id} position={[m.lat, m.lng]} icon={iconFor(m)} keyboard={!!m.onClick}
          eventHandlers={m.onClick ? { click: m.onClick } : undefined} title={m.title}>
          {m.title && <Tooltip direction="top" offset={[0, -12]}>{m.title}</Tooltip>}
        </Marker>
      ))}
      <Fit points={fit} padding={padding} />
    </MapContainer>
  );
}
