/**
 * SAMPLE DATA for demo mode only. Nothing here is real: names, phone
 * numbers, ratings, prices and coordinates are placeholders so the
 * interface can be used without a backend.
 */
import type { Incident, Issue, Review, Verification } from "../types";

export type ServiceTag =
  | "tyre"
  | "battery"
  | "engine"
  | "cooling"
  | "electrical"
  | "fuel"
  | "towing"
  | "heavy"
  | "two_wheeler"
  | "mobile_van";

export interface SeedMechanic {
  id: string;
  name: string;
  owner: string;
  initials: string;
  phone: string;
  rating: number;
  reviews: number;
  tags: ServiceTag[];
  vehicle_label: string;
  plate: string;
  verified: boolean;
  online: boolean;
  lat: number;
  lng: number;
  typical_arrival_min: number;
  area: string;
  prices: Partial<Record<Issue, [number, number]>>;
}

export const MECHANICS: SeedMechanic[] = [
  {
    id: "m1", name: "Sharma Auto Works", owner: "Ramesh Sharma", initials: "SA", phone: "+910000000001",
    rating: 4.8, reviews: 312, tags: ["tyre", "battery", "mobile_van", "fuel"], vehicle_label: "Mobile van",
    plate: "RJ14 GC 4471", verified: true, online: true, lat: 26.8502, lng: 75.5868, typical_arrival_min: 10,
    area: "Mahindra World City turn, NH-48",
    prices: { flat: [300, 600], battery: [300, 500], fuel: [200, 400], start: [300, 700], other: [300, 800] },
  },
  {
    id: "m2", name: "Shree Balaji Tyre & Puncture", owner: "Mahesh Saini", initials: "SB", phone: "+910000000002",
    rating: 4.9, reviews: 87, tags: ["tyre", "two_wheeler"], vehicle_label: "Service bike",
    plate: "RJ14 SK 1180", verified: true, online: true, lat: 26.8611, lng: 75.6121, typical_arrival_min: 15,
    area: "Bhankrota, Ajmer Road", prices: { flat: [150, 400] },
  },
  {
    id: "m3", name: "Rajputana Motor Garage", owner: "Vikram Singh", initials: "RG", phone: "+910000000003",
    rating: 4.6, reviews: 198, tags: ["engine", "cooling", "electrical", "battery", "tyre", "towing", "mobile_van"],
    vehicle_label: "Tow-ready van", plate: "RJ14 CB 9032", verified: true, online: true, lat: 26.8178, lng: 75.5466,
    typical_arrival_min: 14, area: "Bagru Road",
    prices: { flat: [350, 700], heat: [400, 1200], start: [400, 1000], battery: [350, 600], tow: [1500, 3000], other: [400, 1200] },
  },
  {
    id: "m4", name: "Highway Rescue 24×7", owner: "Imran Khan", initials: "HR", phone: "+910000000004",
    rating: 4.5, reviews: 241, tags: ["towing", "heavy", "battery", "engine"], vehicle_label: "Tow truck",
    plate: "RJ14 GT 7720", verified: true, online: true, lat: 26.8801, lng: 75.6905, typical_arrival_min: 18,
    area: "Kamla Nehru Nagar, Ajmer Road",
    prices: { tow: [1500, 3500], battery: [400, 700], heat: [600, 1500], start: [500, 1200], other: [600, 1500] },
  },
  {
    id: "m5", name: "Kumar Fuel Assist", owner: "Sunil Kumar", initials: "KF", phone: "+910000000005",
    rating: 4.7, reviews: 64, tags: ["fuel", "battery", "two_wheeler"], vehicle_label: "Service bike",
    plate: "RJ14 FA 3309", verified: true, online: true, lat: 26.8641, lng: 75.6458, typical_arrival_min: 12,
    area: "Bhankrota, Ajmer Road", prices: { fuel: [200, 350], battery: [300, 450] },
  },
  {
    id: "m6", name: "Jai Ambe Towing", owner: "Gopal Meena", initials: "JA", phone: "+910000000006",
    rating: 4.4, reviews: 51, tags: ["towing", "heavy"], vehicle_label: "Tow truck", plate: "RJ14 JT 5518",
    verified: true, online: true, lat: 26.8216, lng: 75.9829, typical_arrival_min: 20, area: "Kanota, Agra Road",
    prices: { tow: [1800, 3500] },
  },
  {
    id: "m7", name: "Kumawat Auto Care", owner: "Hari Kumawat", initials: "KA", phone: "+910000000007",
    rating: 4.3, reviews: 12, tags: ["engine", "electrical"], vehicle_label: "Van", plate: "RJ14 KC 6042",
    verified: false, online: true, lat: 26.84, lng: 75.58, typical_arrival_min: 12, area: "Chomu, Sikar Road",
    prices: { start: [400, 900] },
  },
];

export const TAG_LABEL: Record<ServiceTag, string> = {
  tyre: "Tyres", battery: "Battery", engine: "Engine", cooling: "Cooling", electrical: "Electrical",
  fuel: "Fuel delivery", towing: "Towing", heavy: "Trucks & buses", two_wheeler: "Two-wheelers", mobile_van: "Mobile van",
};

export const REVIEWS: Review[] = [
  { id: "r1", stars: 5, service: "Battery jump-start", text: "Reached in 10 minutes at night. Polite, fair price.", tags: ["Arrived quickly", "Felt safe"], when: "Yesterday" },
  { id: "r2", stars: 4, service: "Tyre change", text: "Good work, took a while to find my location.", tags: ["Fixed it properly"], when: "2 days ago" },
  { id: "r3", stars: 5, service: "Puncture repair", text: "Explained everything before starting. Charged what was quoted.", tags: ["Fair price", "Explained the problem"], when: "4 days ago" },
];

export const SEED_INCIDENTS: Incident[] = [
  { id: "JPR-2043", issue_label: "Overheating", vehicle_label: "Car", highway: "NH-21 Agra Rd", place: "Kanota", lat: 26.8216, lng: 75.9629, status: "en_route", minutes_waiting: 7, eta_min: 6, mechanic_name: "Jaipur Motors", sos: false },
  { id: "JPR-2044", issue_label: "Battery dead", vehicle_label: "Two-wheeler", highway: "NH-48 Delhi Rd", place: "Achrol", lat: 27.1333, lng: 75.8893, status: "open", minutes_waiting: 2, eta_min: null, mechanic_name: null, sos: false },
  { id: "JPR-2039", issue_label: "Accident / towing", vehicle_label: "Truck", highway: "NH-52 Tonk Rd", place: "Shivdaspura", lat: 26.7231, lng: 75.8463, status: "open", minutes_waiting: 12, eta_min: null, mechanic_name: null, sos: true },
  { id: "JPR-2036", issue_label: "Out of fuel", vehicle_label: "Car", highway: "NH-52 Sikar Rd", place: "Chomu", lat: 27.1667, lng: 75.7246, status: "fixing", minutes_waiting: 18, eta_min: null, mechanic_name: "Kumar Fuel Assist", sos: false },
];

export const SEED_VERIFICATIONS: Verification[] = [
  { id: "v1", workshop: "Kumawat Auto Care", area: "Chomu, Sikar Road", services: "Engine, Electrical", submitted: "2 hours ago", status: "pending",
    documents: [{ name: "Owner ID (Aadhaar)", submitted: true }, { name: "Workshop licence", submitted: true }, { name: "Vehicle RC", submitted: true }] },
  { id: "v2", workshop: "Meena Tyre House", area: "Shivdaspura, Tonk Road", services: "Tyres, Puncture", submitted: "Yesterday", status: "missing_docs",
    documents: [{ name: "Owner ID (Aadhaar)", submitted: true }, { name: "Workshop licence", submitted: true }, { name: "Vehicle RC", submitted: false }] },
  { id: "v3", workshop: "Jai Ambe Towing", area: "Kanota, Agra Road", services: "Towing, Battery", submitted: "2 days ago", status: "pending",
    documents: [{ name: "Owner ID (Aadhaar)", submitted: true }, { name: "Workshop licence", submitted: true }, { name: "Vehicle RC", submitted: true }] },
];

export const ONLINE_MECHANIC_POINTS = [
  [26.85, 75.587], [26.861, 75.612], [26.818, 75.547], [26.88, 75.69], [26.864, 75.646], [26.92, 75.78],
  [26.95, 75.82], [26.84, 75.86], [27.0, 75.87], [27.08, 75.75], [26.78, 75.83], [26.83, 75.93],
];

export const HOTSPOTS = [
  { lat: 26.8385, lng: 75.5652, weight: 0.9, label: "Mahindra World City turn" },
  { lat: 26.7231, lng: 75.8463, weight: 0.7, label: "Shivdaspura" },
  { lat: 27.1333, lng: 75.8893, weight: 0.6, label: "Achrol" },
  { lat: 26.8216, lng: 75.9829, weight: 0.5, label: "Kanota" },
];
