/**
 * Single entry point for all data. Screens only talk to `api`.
 *
 *  - NEXT_PUBLIC_API_URL set   → HTTP client for your backend (contract in docs/API_CONTRACT.md)
 *  - NEXT_PUBLIC_API_URL empty → demo mode with sample data (lib/mock/api.ts)
 */
import { mockApi } from "./mock/api";
import type {
  AdminOverview, CreateRequestInput, FeedbackInput, GeoPoint, LineItem, MechanicDashboard, OtpChallenge,
  PastRequest, RecommendInput, RecommendResult, Role, ServiceRequest, Session, SosAlert,
} from "./types";

import { ApiError } from "./errors";
export { ApiError };

export interface Api {
  // Driver
  recommend(input: RecommendInput): Promise<RecommendResult>;
  createRequest(input: CreateRequestInput): Promise<ServiceRequest>;
  getRequest(id: string): Promise<ServiceRequest>;
  cancelRequest(id: string, reason?: string): Promise<ServiceRequest>;
  confirmMechanic(id: string): Promise<ServiceRequest>;
  confirmPayment(id: string): Promise<ServiceRequest>;
  // Mechanic
  mechanicDashboard(mechanicId: string): Promise<MechanicDashboard>;
  setAvailability(mechanicId: string, online: boolean): Promise<void>;
  setService(mechanicId: string, key: string, enabled: boolean): Promise<void>;
  acceptRequest(id: string, mechanicId: string): Promise<ServiceRequest>;
  declineRequest(id: string, mechanicId: string, reason: string): Promise<void>;
  markArrived(id: string): Promise<ServiceRequest>;
  verifyCode(id: string, code: string): Promise<ServiceRequest>;
  sendBill(id: string, items: LineItem[], payment: "upi" | "cash"): Promise<ServiceRequest>;
  // Feedback
  submitFeedback(input: FeedbackInput): Promise<void>;
  pastRequests(): Promise<PastRequest[]>;
  reportProblem(requestId: string, category: string, details: string): Promise<void>;
  // SOS
  sendSos(location: GeoPoint | null, requestId?: string | null): Promise<SosAlert>;
  resolveSos(id: string): Promise<SosAlert>;
  // Control room
  adminOverview(): Promise<AdminOverview>;
  acknowledgeSos(id: string): Promise<void>;
  assignIncident(id: string): Promise<void>;
  approveVerification(id: string): Promise<void>;
  requestDocument(id: string, document: string): Promise<void>;
  // Auth
  sendOtp(input: { role: Role; phone?: string; email?: string; password?: string }): Promise<OtpChallenge>;
  verifyOtp(challengeId: string, code: string): Promise<Session>;
}

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const isDemoMode = !BASE;

async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("sb-token") : null;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }
  if (!res.ok) {
    let detail: unknown;
    try { detail = await res.json(); } catch { /* not JSON */ }
    const msg = (detail as { detail?: string })?.detail;
    throw new ApiError(typeof msg === "string" ? msg : `Request failed (${res.status})`, res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const httpApi: Api = {
  recommend: (i) => http("POST", "/api/recommendations", i),
  createRequest: (i) => http("POST", "/api/requests", i),
  getRequest: (id) => http("GET", `/api/requests/${id}`),
  cancelRequest: (id, reason) => http("POST", `/api/requests/${id}/cancel`, { reason }),
  confirmMechanic: (id) => http("POST", `/api/requests/${id}/confirm-mechanic`),
  confirmPayment: (id) => http("POST", `/api/requests/${id}/confirm-payment`),
  mechanicDashboard: (m) => http("GET", `/api/mechanics/${m}/dashboard`),
  setAvailability: (m, online) => http("POST", `/api/mechanics/${m}/availability`, { online }),
  setService: (m, key, enabled) => http("POST", `/api/mechanics/${m}/services`, { service: key, enabled }),
  acceptRequest: (id, m) => http("POST", `/api/requests/${id}/accept`, { mechanic_id: m }),
  declineRequest: (id, m, reason) => http("POST", `/api/requests/${id}/decline`, { mechanic_id: m, reason }),
  markArrived: (id) => http("POST", `/api/requests/${id}/arrive`),
  verifyCode: (id, code) => http("POST", `/api/requests/${id}/verify`, { code }),
  sendBill: (id, items, payment) => http("POST", `/api/requests/${id}/bill`, { line_items: items, payment_method: payment }),
  submitFeedback: (i) => http("POST", "/api/feedback", i),
  pastRequests: () => http("GET", "/api/requests?mine=true"),
  reportProblem: (id, category, details) => http("POST", `/api/requests/${id}/report`, { category, details }),
  sendSos: (location, request_id) => http("POST", "/api/sos", { location, request_id }),
  resolveSos: (id) => http("POST", `/api/sos/${id}/resolve`),
  adminOverview: () => http("GET", "/api/admin/overview"),
  acknowledgeSos: (id) => http("POST", `/api/admin/sos/${id}/acknowledge`),
  assignIncident: (id) => http("POST", `/api/admin/incidents/${id}/assign`),
  approveVerification: (id) => http("POST", `/api/admin/verifications/${id}/approve`),
  requestDocument: (id, document) => http("POST", `/api/admin/verifications/${id}/request-document`, { document }),
  sendOtp: (i) => http("POST", "/api/auth/otp/send", i),
  verifyOtp: (challenge_id, code) => http("POST", "/api/auth/otp/verify", { challenge_id, code }),
};

export const api: Api = isDemoMode ? mockApi : httpApi;
