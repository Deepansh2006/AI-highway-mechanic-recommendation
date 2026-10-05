import type { Issue, Vehicle } from "./types";

export const VEHICLES: { key: Vehicle; label: string }[] = [
  { key: "car", label: "Car" },
  { key: "bike", label: "Two-wheeler" },
  { key: "auto", label: "Auto" },
  { key: "truck", label: "Truck / Bus" },
];

export const ISSUES: { key: Issue; label: string }[] = [
  { key: "flat", label: "Flat tyre" },
  { key: "battery", label: "Battery dead" },
  { key: "heat", label: "Overheating" },
  { key: "start", label: "Won't start" },
  { key: "fuel", label: "Out of fuel" },
  { key: "tow", label: "Accident / towing" },
  { key: "other", label: "Not sure" },
];

export const vehicleLabel = (v: Vehicle) => VEHICLES.find((x) => x.key === v)?.label ?? v;
export const issueLabel = (i: Issue) => ISSUES.find((x) => x.key === i)?.label ?? i;

export const rupees = (n: number) => "₹" + n.toLocaleString("en-IN");
export const priceRange = (min: number | null, max: number | null) =>
  min == null || max == null ? "—" : `₹${min.toLocaleString("en-IN")}–${max.toLocaleString("en-IN")}`;

export const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export const mmss = (secs: number) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const EMERGENCY_NUMBERS = [
  { number: "112", label: "Police / Fire / Emergency" },
  { number: "108", label: "Ambulance" },
  { number: "1033", label: "NHAI highway helpline" },
];

export const ACCEPT_WINDOW_S = 90;
export const SEARCH_RADIUS_KM = 25;
