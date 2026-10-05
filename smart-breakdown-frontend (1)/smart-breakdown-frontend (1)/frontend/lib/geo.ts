import type { GeoPoint } from "./types";

const R = 6371.0088;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough drive time: road distance ≈ 1.3 × straight line at ~32 km/h, plus 3 min to set off. */
export function etaMinutes(km: number) {
  return Math.max(2, Math.round(((km * 1.3) / 32) * 60) + 3);
}

export function lerp(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  const k = Math.max(0, Math.min(1, t));
  return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k };
}

/**
 * Known landmarks along Jaipur's highways (approximate coordinates).
 * Used to describe a GPS fix in words ("Near …") and for manual search.
 * Replace with your geocoding / reverse-geocoding service when available.
 */
export const LANDMARKS: { name: string; road: string; lat: number; lng: number }[] = [
  { name: "Mahindra World City turn", road: "NH-48 · Ajmer Road", lat: 26.8385, lng: 75.5652 },
  { name: "Bagru toll plaza", road: "NH-48 · Ajmer Road", lat: 26.8152, lng: 75.5398 },
  { name: "Bhankrota", road: "NH-48 · Ajmer Road", lat: 26.8641, lng: 75.6458 },
  { name: "200 Feet Bypass", road: "Ajmer Road", lat: 26.8936, lng: 75.7398 },
  { name: "Sanganer airport", road: "Tonk Road", lat: 26.8242, lng: 75.8122 },
  { name: "Shivdaspura", road: "NH-52 · Tonk Road", lat: 26.7231, lng: 75.8463 },
  { name: "Kanota", road: "NH-21 · Agra Road", lat: 26.8216, lng: 75.9829 },
  { name: "Achrol", road: "NH-48 · Delhi Road", lat: 27.1333, lng: 75.8893 },
  { name: "Chomu", road: "NH-52 · Sikar Road", lat: 27.1667, lng: 75.7246 },
];

export function describePoint(p: { lat: number; lng: number }) {
  let best = LANDMARKS[0];
  let bestD = Infinity;
  for (const l of LANDMARKS) {
    const d = haversineKm(p, l);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  const near = bestD < 0.6 ? "At" : "Near";
  return {
    title: best.road,
    subtitle: `${near} ${best.name}${bestD >= 0.6 ? ` · ${bestD.toFixed(1)} km away` : ""}`,
    landmark: best,
    distanceKm: bestD,
  };
}

/** Default demo position: NH-48 near Mahindra World City turn. */
export const DEMO_POSITION: GeoPoint = { lat: 26.8371, lng: 75.5701, label: "NH-48, near Mahindra World City turn", accuracy_m: 15 };
