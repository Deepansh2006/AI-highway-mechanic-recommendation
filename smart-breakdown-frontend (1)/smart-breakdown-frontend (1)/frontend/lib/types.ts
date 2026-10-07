/**
 * Shared data shapes. Field names are snake_case so they map 1:1 to a
 * FastAPI / Pydantic backend. See docs/API_CONTRACT.md.
 */

export type Vehicle = "car" | "bike" | "auto" | "truck";
export type Issue = "flat" | "battery" | "heat" | "start" | "fuel" | "tow" | "other";
export type Confidence = "High" | "Medium" | "Low";
export type SortKey = "best" | "nearest" | "top";
export type Role = "driver" | "mechanic" | "admin";

export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
  accuracy_m?: number | null;
}

export interface Diagnosis {
  issue: Issue;
  title: string;
  confidence: Confidence;
  service: string;
  body: string;
  mechanic_tip: string;
}

export interface Reason {
  label: string;
  value: string;
}

export interface Recommendation {
  mechanic_id: string;
  name: string;
  owner: string;
  initials: string;
  rating: number;
  reviews: number;
  distance_km: number;
  eta_min: number;
  price_min: number;
  price_max: number;
  services_label: string;
  vehicle_label: string;
  plate: string;
  verified: boolean;
  is_best: boolean;
  reasons: Reason[];
}

export interface RecommendInput {
  lat: number;
  lng: number;
  vehicle: Vehicle;
  issue: Issue;
  description: string;
  sort: SortKey;
}

export interface RecommendResult {
  radius_km: number;
  diagnosis: Diagnosis;
  mechanics: Recommendation[];
}

export type RequestStatus =
  | "pending" // waiting for the assigned mechanic (90 s accept window)
  | "en_route"
  | "arrived" // waiting for identity check / code
  | "repairing"
  | "billing" // mechanic sent the bill, driver confirms
  | "completed"
  | "cancelled"
  | "unassigned"; // nobody accepted inside the radius

export interface LineItem {
  label: string;
  amount: number;
}

export interface ServiceRequest {
  id: string;
  status: RequestStatus;
  vehicle: Vehicle;
  issue: Issue;
  description: string;
  location: GeoPoint;
  diagnosis: Diagnosis;
  mechanic_id: string | null;
  mechanic_name: string | null;
  mechanic_owner: string | null;
  mechanic_initials: string | null;
  mechanic_rating: number | null;
  mechanic_vehicle_label: string | null;
  mechanic_plate: string | null;
  mechanic_phone: string | null;
  mechanic_location: GeoPoint | null;
  reassigned: boolean;
  previous_mechanic_name: string | null;
  created_at: number; // epoch ms
  accept_deadline: number | null; // epoch ms
  accepted_at: number | null;
  arrived_at: number | null;
  completed_at: number | null;
  verification_code: string;
  distance_km: number | null;
  eta_min: number | null;
  price_min: number | null;
  price_max: number | null;
  line_items: LineItem[];
  final_amount: number | null;
  payment_method: "upi" | "cash" | null;
  driver_name: string;
  driver_vehicle_model: string;
  driver_plate: string;
}

export interface CreateRequestInput {
  location: GeoPoint;
  vehicle: Vehicle;
  issue: Issue;
  description: string;
  mechanic_id: string;
}

export interface ServiceOffering {
  key: string;
  label: string;
  price_label: string;
  enabled: boolean;
}

export interface NearbyRequest {
  id: string;
  issue_label: string;
  vehicle_label: string;
  place: string;
  minutes_ago: number;
  distance_km: number;
}

export interface Review {
  id: string;
  stars: number;
  service: string;
  text: string;
  tags: string[];
  when: string;
}

export interface MechanicDashboard {
  mechanic: {
    id: string;
    name: string;
    owner: string;
    initials: string;
    area: string;
    radius_km: number;
    rating: number;
    reviews: number;
    verified: boolean;
  };
  online: boolean;
  incoming: ServiceRequest | null;
  active: ServiceRequest | null;
  last_completed: ServiceRequest | null;
  today: { jobs: number; earned: number; avg_response_min: number };
  week: { day: string; amount: number }[];
  week_summary: { earned: number; jobs: number; accepted: number; offered: number; on_time: number };
  nearby: NearbyRequest[];
  services: ServiceOffering[];
  reviews: Review[];
}

export interface FeedbackInput {
  request_id: string;
  rating: number;
  tags: string[];
  price_matched: boolean | null;
  charged_amount: number | null;
  comment: string;
}

export interface PastRequest {
  id: string;
  issue_label: string;
  mechanic_name: string;
  date: string;
  rated: number | null;
}

export interface SosAlert {
  id: string;
  sent_at: number;
  location: GeoPoint | null;
  notified: string[];
  status: "active" | "acknowledged" | "resolved";
  place: string;
}

export type IncidentStatus = "open" | "en_route" | "fixing" | "resolved";

export interface Incident {
  id: string;
  issue_label: string;
  vehicle_label: string;
  highway: string;
  place: string;
  lat: number;
  lng: number;
  status: IncidentStatus;
  minutes_waiting: number;
  eta_min: number | null;
  mechanic_name: string | null;
  sos: boolean;
}

export interface Verification {
  id: string;
  workshop: string;
  area: string;
  services: string;
  documents: { name: string; submitted: boolean }[];
  status: "pending" | "missing_docs" | "approved";
  submitted: string;
}

export interface AdminOverview {
  kpis: { open_requests: number; mechanics_online: number; avg_arrival_min: number; active_sos: number };
  incidents: Incident[];
  sos: SosAlert[];
  verifications: Verification[];
  mechanics: { id: string; name: string; lat: number; lng: number; online: boolean }[];
  hotspots: { lat: number; lng: number; weight: number; label: string }[];
}

export interface OtpChallenge {
  challenge_id: string;
  sent_to: string;
  expires_in_s: number;
  demo_code?: string;
}

export interface Session {
  role: Role;
  name: string;
  mechanic_id?: string;
  token: string;
}

export interface MechanicRegisterInput {
  business_name: string;
  phone_number: string;
  latitude: number;
  longitude: number;
  owner_name?: string;
  vehicle_label?: string;
  vehicle_plate?: string;
  area?: string;
  capabilities?: string[];
}

export interface MechanicRegisterResult {
  status: string;
  mechanic_id: string;
}
