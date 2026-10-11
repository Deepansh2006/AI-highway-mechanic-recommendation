/**
 * DEMO MODE implementation of the Api interface.
 *
 * State lives in localStorage so a driver tab and a mechanic tab in the same
 * browser see the same requests. When no mechanic dashboard is open, an
 * "autopilot" plays the mechanic's part (accepts, drives, arrives, bills) so
 * the driver flow can be tried alone; when the dashboard is open the
 * mechanic's clicks drive the request instead. Likewise, requests created by
 * the dashboard's simulated driver are confirmed automatically.
 */
import type { Api } from "../api";
import { ApiError } from "../errors";
import { DEMO_POSITION, describePoint, lerp } from "../geo";
import { ACCEPT_WINDOW_S, issueLabel, vehicleLabel } from "../labels";
import type {
  AdminOverview, FeedbackInput, GeoPoint, Incident, Issue, MechanicDashboard, PastRequest, Recommendation,
  MechanicRegisterInput, MechanicRegisterResult, ServiceRequest, SosAlert, Verification,
} from "../types";
import { HOTSPOTS, MECHANICS, ONLINE_MECHANIC_POINTS, REVIEWS, SEED_INCIDENTS, SEED_VERIFICATIONS } from "./data";
import { defaultBill, diagnose, mechanicById, recommend } from "./engine";

const KEY = "sb-demo-store-v1";
const AUTO_ACCEPT_MS = 6000;
const TRAVEL_MS = 30000;
const AUTO_REPAIR_MS = 12000;
const SIM_DRIVER_MS = 5000;
const SPAWN_DELAY_MS = 5000;
const HEARTBEAT_MS = 8000;
const DEMO_CODE = "123456";

interface MockReq extends ServiceRequest {
  _tried: string[];
  _sim_driver: boolean;
  _start: GeoPoint | null;
  _eta0: number;
  _pending_since: number;
  _repair_at: number | null;
  _bill_at: number | null;
  _rated: number | null;
}

interface MechState {
  online: boolean;
  disabled: string[];
  heartbeat: number;
  spawn_at: number | null;
  cooldown_until: number;
}

interface Store {
  seq: number;
  requests: Record<string, MockReq>;
  sos: SosAlert[];
  feedback: FeedbackInput[];
  verifications: Verification[];
  ackSeedSos: boolean;
  assigned: string[];
  mech: Record<string, MechState>;
  challenges: Record<string, { role: "driver" | "mechanic" | "admin"; attempts: number }>;
}

const wait = (ms = 250 + Math.random() * 200) => new Promise((r) => setTimeout(r, ms));

function fresh(): Store {
  return {
    seq: 0, requests: {}, sos: [], feedback: [], verifications: SEED_VERIFICATIONS.map((v) => ({ ...v, documents: v.documents.map((d) => ({ ...d })) })),
    ackSeedSos: false, assigned: [], mech: {}, challenges: {},
  };
}

function load(): Store {
  if (typeof window === "undefined") return fresh();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as Store) };
  } catch { /* ignore corrupt store */ }
  return fresh();
}

function save(s: Store) {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
  }
}

function mech(s: Store, id: string): MechState {
  if (!s.mech[id]) s.mech[id] = { online: true, disabled: ["towing"], heartbeat: 0, spawn_at: null, cooldown_until: 0 };
  return s.mech[id];
}

function assign(req: MockReq, rec: Recommendation) {
  const m = mechanicById(rec.mechanic_id)!;
  req.mechanic_id = m.id;
  req.mechanic_name = m.name;
  req.mechanic_owner = m.owner;
  req.mechanic_initials = m.initials;
  req.mechanic_rating = m.rating;
  req.mechanic_vehicle_label = m.vehicle_label;
  req.mechanic_plate = m.plate;
  req.mechanic_phone = m.phone;
  req.mechanic_location = { lat: m.lat, lng: m.lng };
  req.distance_km = rec.distance_km;
  req.eta_min = rec.eta_min;
  req.price_min = rec.price_min;
  req.price_max = rec.price_max;
  req._start = { lat: m.lat, lng: m.lng };
  req._eta0 = rec.eta_min;
}

function reassign(req: MockReq, now: number) {
  if (req.mechanic_id) req._tried.push(req.mechanic_id);
  const next = recommend({ lat: req.location.lat, lng: req.location.lng, vehicle: req.vehicle, issue: req.issue, description: req.description, sort: "best" })
    .mechanics.find((r) => !req._tried.includes(r.mechanic_id));
  req.previous_mechanic_name = req.mechanic_name;
  if (!next) {
    req.status = "unassigned";
    req.mechanic_id = null;
    req.accept_deadline = null;
    return;
  }
  assign(req, next);
  req.reassigned = true;
  req.accept_deadline = now + ACCEPT_WINDOW_S * 1000;
  req._pending_since = now;
}

/** Applies time-based transitions (autopilot, deadlines, travel). */
function advance(s: Store, req: MockReq, now: number) {
  for (let guard = 0; guard < 6; guard++) {
    const hb = req.mechanic_id ? (s.mech[req.mechanic_id]?.heartbeat ?? 0) : 0;
    const mechanicAuto = now - hb > HEARTBEAT_MS;
    const before = req.status;
    if (req.status === "pending") {
      if (req.accept_deadline && now > req.accept_deadline) reassign(req, now);
      else if (mechanicAuto && now - req._pending_since > AUTO_ACCEPT_MS) {
        req.status = "en_route";
        req.accepted_at = req._pending_since + AUTO_ACCEPT_MS;
      }
    } else if (req.status === "en_route" && req.accepted_at && req._start) {
      const p = (now - req.accepted_at) / TRAVEL_MS;
      req.mechanic_location = lerp(req._start, req.location, p);
      req.eta_min = Math.max(1, Math.ceil(req._eta0 * (1 - Math.min(p, 1))));
      if (p >= 1 && mechanicAuto) {
        req.status = "arrived";
        req.arrived_at = req.accepted_at + TRAVEL_MS;
        req.mechanic_location = { ...req.location };
      }
    } else if (req.status === "arrived") {
      if (req._sim_driver && req.arrived_at && now - req.arrived_at > SIM_DRIVER_MS * 3) {
        // simulated driver waits for the mechanic to enter the code; nothing to do
      }
    } else if (req.status === "repairing" && req._repair_at) {
      if (mechanicAuto && now - req._repair_at > AUTO_REPAIR_MS) {
        req.status = "billing";
        req.line_items = defaultBill(req.issue);
        req.final_amount = req.line_items.reduce((a, b) => a + b.amount, 0);
        req.payment_method = "upi";
        req._bill_at = req._repair_at + AUTO_REPAIR_MS;
      }
    } else if (req.status === "billing" && req._bill_at) {
      if (req._sim_driver && now - req._bill_at > SIM_DRIVER_MS) {
        req.status = "completed";
        req.completed_at = now;
      }
    }
    if (req.status === before) break;
  }
}

function getReq(s: Store, id: string): MockReq {
  const r = s.requests[id] ?? seedPast(id);
  if (!r) throw new ApiError("Request not found", 404);
  return r;
}

function publicReq(r: MockReq): ServiceRequest {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _tried, _sim_driver, _start, _eta0, _pending_since, _repair_at, _bill_at, _rated, ...rest } = r;
  return JSON.parse(JSON.stringify(rest));
}

function newRequest(s: Store, input: { location: GeoPoint; vehicle: ServiceRequest["vehicle"]; issue: Issue; description: string }, sim: boolean): MockReq {
  const now = Date.now();
  s.seq += 1;
  const diagnosis = diagnose(input.issue, input.description);
  return {
    id: `JPR-${2044 + s.seq}`, status: "pending", vehicle: input.vehicle, issue: input.issue, description: input.description,
    location: input.location, diagnosis, mechanic_id: null, mechanic_name: null, mechanic_owner: null, mechanic_initials: null,
    mechanic_rating: null, mechanic_vehicle_label: null, mechanic_plate: null, mechanic_phone: null, mechanic_location: null,
    reassigned: false, previous_mechanic_name: null, created_at: now, accept_deadline: now + ACCEPT_WINDOW_S * 1000,
    accepted_at: null, arrived_at: null, completed_at: null,
    verification_code: String(1000 + Math.floor(Math.random() * 9000)), distance_km: null, eta_min: null, price_min: null,
    price_max: null, line_items: [], final_amount: null, payment_method: null,
    driver_name: sim ? "Rohit M." : "You", driver_vehicle_model: input.vehicle === "car" ? "Maruti Swift · White" : vehicleLabel(input.vehicle),
    driver_plate: "RJ14 CD 2041",
    _tried: [], _sim_driver: sim, _start: null, _eta0: 0, _pending_since: now, _repair_at: null, _bill_at: null, _rated: null,
  };
}

const SEED_PAST: { id: string; issue: Issue; mech: string; amount: number; date: string; rated: number | null; daysAgo: number }[] = [
  { id: "JPR-2041", issue: "flat", mech: "m1", amount: 450, date: "Today", rated: null, daysAgo: 0 },
  { id: "JPR-1987", issue: "battery", mech: "m4", amount: 450, date: "12 Sep", rated: 5, daysAgo: 21 },
  { id: "JPR-1931", issue: "fuel", mech: "m5", amount: 300, date: "28 Aug", rated: null, daysAgo: 36 },
];

function seedPast(id: string): MockReq | null {
  const p = SEED_PAST.find((x) => x.id === id);
  if (!p) return null;
  const m = mechanicById(p.mech)!;
  const at = Date.now() - p.daysAgo * 86400000 - 40 * 60000;
  const items = defaultBill(p.issue);
  return {
    id: p.id, status: "completed", vehicle: "car", issue: p.issue, description: "", location: DEMO_POSITION,
    diagnosis: diagnose(p.issue, ""), mechanic_id: m.id, mechanic_name: m.name, mechanic_owner: m.owner,
    mechanic_initials: m.initials, mechanic_rating: m.rating, mechanic_vehicle_label: m.vehicle_label, mechanic_plate: m.plate,
    mechanic_phone: m.phone, mechanic_location: null, reassigned: false, previous_mechanic_name: null, created_at: at,
    accept_deadline: null, accepted_at: at + 40000, arrived_at: at + 11 * 60000, completed_at: at + 30 * 60000,
    verification_code: "0000", distance_km: 2.4, eta_min: 9, price_min: m.prices[p.issue]?.[0] ?? 300,
    price_max: m.prices[p.issue]?.[1] ?? 600, line_items: items, final_amount: p.amount, payment_method: "upi",
    driver_name: "You", driver_vehicle_model: "Maruti Swift · White", driver_plate: "RJ14 CD 2041",
    _tried: [], _sim_driver: false, _start: null, _eta0: 9, _pending_since: at, _repair_at: null, _bill_at: null, _rated: p.rated,
  };
}

function mutate<T>(fn: (s: Store, now: number) => T): T {
  const s = load();
  const out = fn(s, Date.now());
  save(s);
  return out;
}

const SERVICES = [
  { key: "tyre", label: "Tyres & puncture", price_label: "₹150–600" },
  { key: "battery", label: "Battery jump-start", price_label: "₹300–500" },
  { key: "fuel", label: "Fuel delivery", price_label: "₹200 + fuel" },
  { key: "engine", label: "Engine diagnosis", price_label: "from ₹400" },
  { key: "towing", label: "Towing", price_label: "₹1,500+ · needs tow van" },
];

export const mockApi: Api = {
  async recommend(input) {
    await wait(700);
    return recommend(input);
  },

  async createRequest(input) {
    await wait();
    return mutate((s) => {
      const rec = recommend({ lat: input.location.lat, lng: input.location.lng, vehicle: input.vehicle, issue: input.issue, description: input.description, sort: "best" })
        .mechanics.find((r) => r.mechanic_id === input.mechanic_id);
      if (!rec) throw new ApiError("That mechanic is no longer available. Please choose another.", 409);
      const req = newRequest(s, input, false);
      assign(req, rec);
      s.requests[req.id] = req;
      return publicReq(req);
    });
  },

  async getRequest(id) {
    await wait(120);
    return mutate((s, now) => {
      const r = getReq(s, id);
      if (s.requests[id]) advance(s, r, now);
      return publicReq(r);
    });
  },

  async cancelRequest(id) {
    await wait();
    return mutate((s) => {
      const r = getReq(s, id);
      r.status = "cancelled";
      return publicReq(r);
    });
  },

  async confirmMechanic(id) {
    await wait();
    return mutate((s, now) => {
      const r = getReq(s, id);
      advance(s, r, now);
      if (r.status === "arrived") {
        r.status = "repairing";
        r._repair_at = now;
      }
      return publicReq(r);
    });
  },

  async confirmPayment(id) {
    await wait();
    return mutate((s, now) => {
      const r = getReq(s, id);
      if (r.status !== "billing") throw new ApiError("There's no bill to confirm yet.");
      r.status = "completed";
      r.completed_at = now;
      return publicReq(r);
    });
  },

  async mechanicDashboard(mid) {
    await wait(120);
    return mutate((s, now) => {
      const m = mechanicById(mid);
      if (!m) throw new ApiError("Mechanic not found", 404);
      const st = mech(s, mid);
      st.heartbeat = now;
      const mine = Object.values(s.requests).filter((r) => r.mechanic_id === mid);
      mine.forEach((r) => advance(s, r, now));
      const incoming = mine.filter((r) => r.status === "pending").sort((a, b) => b.created_at - a.created_at)[0] ?? null;
      const active = mine.find((r) => ["en_route", "arrived", "repairing", "billing"].includes(r.status)) ?? null;
      const done = mine.filter((r) => r.status === "completed").sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0));

      // Simulated driver so the dashboard can be tried on its own.
      if (st.online && !incoming && !active && now > st.cooldown_until) {
        if (!st.spawn_at) st.spawn_at = now + SPAWN_DELAY_MS;
        else if (now >= st.spawn_at) {
          const req = newRequest(s, { location: DEMO_POSITION, vehicle: "car", issue: "flat", description: "Loud bang from rear left wheel, car pulling to one side" }, true);
          const rec = recommend({ lat: DEMO_POSITION.lat, lng: DEMO_POSITION.lng, vehicle: "car", issue: "flat", description: "", sort: "best" }).mechanics.find((r) => r.mechanic_id === mid);
          if (rec) {
            assign(req, rec);
            s.requests[req.id] = req;
          }
          st.spawn_at = null;
        }
      } else st.spawn_at = null;

      const todayDone = done.filter((r) => (r.completed_at ?? 0) > now - 86400000);
      const earnedToday = 2450 + todayDone.reduce((a, r) => a + (r.final_amount ?? 0), 0);
      const week = [["Sat", 1800], ["Sun", 3600], ["Mon", 1500], ["Tue", 2100], ["Wed", 1250], ["Thu", 1600], ["Today", earnedToday]] as const;
      const dash: MechanicDashboard = {
        mechanic: { id: m.id, name: m.name, owner: m.owner, initials: m.initials, area: m.area, radius_km: 25, rating: m.rating, reviews: m.reviews, verified: m.verified },
        online: st.online,
        incoming: incoming && st.online ? publicReq(s.requests[incoming.id] ?? incoming) : null,
        active: active ? publicReq(active) : null,
        last_completed: done[0] ? publicReq(done[0]) : null,
        today: { jobs: 3 + todayDone.length, earned: earnedToday, avg_response_min: 4 },
        week: week.map(([day, amount]) => ({ day, amount })),
        week_summary: { earned: 11850 + earnedToday, jobs: 18 + 3 + todayDone.length, accepted: 21, offered: 24, on_time: 19 },
        nearby: [
          { id: "n1", issue_label: "Battery dead", vehicle_label: "Two-wheeler", place: "Bagru Rd toll plaza", minutes_ago: 3, distance_km: 5.2 },
          { id: "n2", issue_label: "Overheating", vehicle_label: "Car", place: "Bhankrota, Ajmer Rd", minutes_ago: 6, distance_km: 7.8 },
          { id: "n3", issue_label: "Out of fuel", vehicle_label: "Truck", place: "NH-48, Mahapura", minutes_ago: 11, distance_km: 9.1 },
        ],
        services: SERVICES.map((x) => ({ ...x, enabled: !st.disabled.includes(x.key) })),
        reviews: REVIEWS,
      };
      return dash;
    });
  },

  async setAvailability(mid, online) {
    await wait();
    mutate((s, now) => {
      const st = mech(s, mid);
      st.online = online;
      st.cooldown_until = now + 3000;
      st.spawn_at = null;
    });
  },

  async setService(mid, key, enabled) {
    await wait(150);
    mutate((s) => {
      const st = mech(s, mid);
      st.disabled = enabled ? st.disabled.filter((k) => k !== key) : [...new Set([...st.disabled, key])];
    });
  },

  async acceptRequest(id, mid) {
    await wait();
    return mutate((s, now) => {
      const r = getReq(s, id);
      advance(s, r, now);
      if (r.status !== "pending" || r.mechanic_id !== mid) throw new ApiError("This request is no longer available.", 409);
      r.status = "en_route";
      r.accepted_at = now;
      return publicReq(r);
    });
  },

  async declineRequest(id, mid) {
    await wait();
    mutate((s, now) => {
      const r = getReq(s, id);
      if (r.status === "pending" && r.mechanic_id === mid) reassign(r, now);
      const st = mech(s, mid);
      st.cooldown_until = now + 15000;
    });
  },

  async markArrived(id) {
    await wait();
    return mutate((s, now) => {
      const r = getReq(s, id);
      if (r.status !== "en_route") throw new ApiError("You can only mark arrival while on the way.");
      r.status = "arrived";
      r.arrived_at = now;
      r.mechanic_location = { ...r.location };
      r.eta_min = 0;
      return publicReq(r);
    });
  },

  async verifyCode(id, code) {
    await wait();
    return mutate((s, now) => {
      const r = getReq(s, id);
      if (code.trim() !== r.verification_code) throw new ApiError("That code doesn't match. Ask the driver to read it again.", 422);
      if (r.status === "arrived") {
        r.status = "repairing";
        r._repair_at = now;
      }
      return publicReq(r);
    });
  },

  async sendBill(id, items, payment) {
    await wait();
    return mutate((s, now) => {
      const r = getReq(s, id);
      if (r.status !== "repairing") throw new ApiError("Start the repair before sending a bill.");
      r.status = "billing";
      r.line_items = items;
      r.final_amount = items.reduce((a, b) => a + b.amount, 0);
      r.payment_method = payment;
      r._bill_at = now;
      mech(s, r.mechanic_id!).cooldown_until = now + 12000;
      return publicReq(r);
    });
  },

  async submitFeedback(input) {
    await wait(500);
    mutate((s) => {
      s.feedback.push(input);
      const r = s.requests[input.request_id];
      if (r) r._rated = input.rating;
    });
  },

  async pastRequests() {
    await wait(150);
    const s = load();
    const rated = new Map(s.feedback.filter((f) => f.rating > 0).map((f) => [f.request_id, f.rating]));
    const live: PastRequest[] = Object.values(s.requests)
      .filter((r) => r.status === "completed" && !r._sim_driver)
      .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
      .map((r) => ({ id: r.id, issue_label: issueLabel(r.issue), mechanic_name: r.mechanic_name ?? "", date: "Today", rated: rated.get(r.id) ?? null }));
    const seed: PastRequest[] = SEED_PAST.map((p) => ({ id: p.id, issue_label: issueLabel(p.issue), mechanic_name: mechanicById(p.mech)!.name, date: p.date, rated: rated.get(p.id) ?? p.rated }));
    return [...live, ...seed];
  },

  async reportProblem(requestId, category, details) {
    await wait(500);
    mutate((s) => { s.feedback.push({ request_id: requestId, rating: 0, tags: [`report:${category}`], price_matched: null, charged_amount: null, comment: details }); });
  },

  async sendSos(location) {
    await wait(600);
    return mutate((s, now) => {
      const alert: SosAlert = {
        id: `SOS-${100 + s.sos.length + 1}`, sent_at: now, location, status: "active",
        place: location ? describePoint(location).subtitle + " · " + describePoint(location).title : "Location unavailable",
        notified: ["Jaipur control room", "Nearest verified mechanic (on standby)"],
      };
      s.sos.unshift(alert);
      return alert;
    });
  },

  async resolveSos(id) {
    await wait();
    return mutate((s) => {
      const a = s.sos.find((x) => x.id === id);
      if (!a) throw new ApiError("Alert not found", 404);
      a.status = "resolved";
      return a;
    });
  },

  async adminOverview() {
    await wait(200);
    return mutate((s, now) => {
      Object.values(s.requests).forEach((r) => advance(s, r, now));
      const live: Incident[] = Object.values(s.requests)
        .filter((r) => !["completed", "cancelled"].includes(r.status))
        .map((r) => ({
          id: r.id, issue_label: issueLabel(r.issue), vehicle_label: vehicleLabel(r.vehicle),
          highway: describePoint(r.location).title, place: describePoint(r.location).landmark.name, lat: r.location.lat, lng: r.location.lng,
          status: r.status === "pending" || r.status === "unassigned" ? "open" : r.status === "en_route" ? "en_route" : "fixing",
          minutes_waiting: Math.max(1, Math.round((now - r.created_at) / 60000)), eta_min: r.status === "en_route" ? r.eta_min : null,
          mechanic_name: r.status === "pending" ? null : r.mechanic_name, sos: false,
        }));
      const seed = SEED_INCIDENTS.map((i) =>
        s.assigned.includes(i.id) ? { ...i, status: "en_route" as const, mechanic_name: "Highway Rescue 24×7", eta_min: 16 } : i,
      );
      const incidents = [...live, ...seed];
      const seedSos: SosAlert = {
        id: "SOS-099", sent_at: now - 9 * 60000, location: { lat: 26.7231, lng: 75.8463 }, status: s.ackSeedSos ? "acknowledged" : "active",
        place: "Shivdaspura · NH-52 Tonk Road (linked to JPR-2039)", notified: ["Jaipur control room", "Driver's 1 emergency contact"],
      };
      const sos = [...s.sos.filter((a) => a.status !== "resolved"), seedSos];
      const overview: AdminOverview = {
        kpis: {
          open_requests: incidents.filter((i) => i.status === "open").length,
          mechanics_online: 42,
          avg_arrival_min: 14,
          active_sos: sos.filter((a) => a.status === "active").length,
        },
        incidents, sos, verifications: s.verifications,
        mechanics: [
          ...MECHANICS.filter((m) => m.verified).map((m) => ({ id: m.id, name: m.name, lat: m.lat, lng: m.lng, online: m.online })),
          ...ONLINE_MECHANIC_POINTS.map(([lat, lng], i) => ({ id: `p${i}`, name: "Verified mechanic", lat, lng, online: true })),
        ],
        hotspots: HOTSPOTS,
      };
      return overview;
    });
  },

  async acknowledgeSos(id) {
    await wait();
    mutate((s) => {
      if (id === "SOS-099") s.ackSeedSos = true;
      const a = s.sos.find((x) => x.id === id);
      if (a) a.status = "acknowledged";
    });
  },

  async assignIncident(id) {
    await wait();
    mutate((s, now) => {
      if (SEED_INCIDENTS.some((i) => i.id === id)) s.assigned.push(id);
      const r = s.requests[id];
      if (r && (r.status === "pending" || r.status === "unassigned")) {
        if (r.status === "unassigned") r._tried = [];
        reassign(r, now);
      }
    });
  },

  async approveVerification(id) {
    await wait();
    mutate((s) => {
      const v = s.verifications.find((x) => x.id === id);
      if (!v) throw new ApiError("Not found", 404);
      if (v.documents.some((d) => !d.submitted)) throw new ApiError("All documents are needed before approval.");
      v.status = "approved";
    });
  },

  async requestDocument(id) {
    await wait();
    mutate((s) => {
      const v = s.verifications.find((x) => x.id === id);
      if (v) v.status = "missing_docs";
    });
  },

  async registerMechanic(input: MechanicRegisterInput): Promise<MechanicRegisterResult> {
    await wait();
    if (!input.business_name.trim()) throw new ApiError("Enter your workshop name.");
    if (input.phone_number.replace(/\D/g, "").length !== 10) throw new ApiError("Enter a 10-digit mobile number.");
    return { status: "ok", mechanic_id: `demo-${Math.random().toString(36).slice(2)}` };
  },

  async sendOtp(input) {
    await wait(500);
    if (input.role === "admin") {
      if (!input.email || !/.+@.+\..+/.test(input.email)) throw new ApiError("Enter your work email.");
      if (!input.password) throw new ApiError("Enter your password.");
    } else if (!input.phone || input.phone.replace(/\D/g, "").length !== 10) {
      throw new ApiError("Enter a 10-digit mobile number.");
    }
    const id = Math.random().toString(36).slice(2);
    mutate((s) => { s.challenges[id] = { role: input.role, attempts: 3 }; });
    const digits = (input.phone ?? "").replace(/\D/g, "");
    return {
      challenge_id: id,
      sent_to: input.role === "admin" ? "your authenticator app" : `+91 ${digits.slice(0, 5)} ••${digits.slice(7)}`,
      expires_in_s: 600,
      demo_code: DEMO_CODE,
    };
  },

  async verifyOtp(challengeId, code) {
    await wait(500);
    return mutate((s) => {
      const c = s.challenges[challengeId];
      if (!c) throw new ApiError("This code has expired. Request a new one.", 410);
      if (code !== DEMO_CODE && code !== "4827") {
        c.attempts -= 1;
        if (c.attempts <= 0) {
          delete s.challenges[challengeId];
          throw new ApiError("Too many wrong attempts. Request a new code.", 429);
        }
        throw new ApiError(`That code didn't match. ${c.attempts} attempt${c.attempts === 1 ? "" : "s"} left.`, 422);
      }
      delete s.challenges[challengeId];
      const name = c.role === "mechanic" ? "Ramesh Sharma" : c.role === "admin" ? "Control room" : "Driver";
      return { role: c.role, name, mechanic_id: c.role === "mechanic" ? "m1" : undefined, token: `demo-${challengeId}` };
    });
  },
};
