/**
 * DEMO-MODE stand-ins for the backend's trained model and ranking.
 * In production the backend returns the diagnosis and the ranked
 * mechanics; this file only lets the UI run without it.
 */
import { etaMinutes, haversineKm } from "../geo";
import { SEARCH_RADIUS_KM } from "../labels";
import type { Diagnosis, Issue, Recommendation, RecommendInput, RecommendResult } from "../types";
import { MECHANICS, TAG_LABEL, type SeedMechanic, type ServiceTag } from "./data";

const RULES: Record<Issue, Omit<Diagnosis, "issue">> = {
  flat: { title: "Likely a tyre puncture or burst", confidence: "High", service: "Mobile tyre repair",
    body: "A mechanic with a mobile tyre van can fix or swap it on the spot. Avoid driving on the flat tyre.",
    mechanic_tip: "Bring a jack, wheel spanner and puncture kit. The driver may not have a usable spare." },
  battery: { title: "Likely a drained or weak battery", confidence: "High", service: "Jump-start / battery check",
    body: "A jump-start usually gets you moving. An old battery may need replacing.",
    mechanic_tip: "Bring jump leads or a booster pack and a battery tester." },
  heat: { title: "Likely a coolant or radiator problem", confidence: "Medium", service: "Cooling system repair",
    body: "Switch off the engine and don't open the radiator cap while it's hot.",
    mechanic_tip: "Bring coolant, hose clamps and a pressure tester. Let the engine cool before opening the cap." },
  start: { title: "Could be battery, starter or fuel supply", confidence: "Low", service: "On-site diagnosis",
    body: "A mechanic with diagnostic tools will find the cause on the spot.",
    mechanic_tip: "Bring a booster pack, multimeter and OBD scanner." },
  fuel: { title: "You've likely run out of fuel", confidence: "High", service: "Fuel delivery",
    body: "A partner can bring petrol or diesel to your location.",
    mechanic_tip: "Confirm petrol or diesel with the driver before setting off." },
  tow: { title: "Your vehicle may need towing", confidence: "Medium", service: "Towing & recovery",
    body: "If anyone is hurt, call 112 first. A tow partner will move the vehicle safely.",
    mechanic_tip: "Check for injuries first. Bring cones and the tow kit." },
  other: { title: "Not enough information yet", confidence: "Low", service: "General roadside assistance",
    body: "We'll send a general mechanic to inspect the vehicle. A photo or voice note helps narrow it down.",
    mechanic_tip: "No clear symptoms reported. Bring a general toolkit and diagnostic scanner." },
};

const KEYWORDS: [Issue, RegExp][] = [
  ["flat", /(puncture|flat|tyre|tire|bang|burst|pankchar|पंक्चर|टायर)/i],
  ["battery", /(battery|click|dead|jump|बैटरी)/i],
  ["heat", /(overheat|steam|smoke|temperature|radiator|coolant|गरम)/i],
  ["fuel", /(fuel|petrol|diesel|empty|पेट्रोल|डीजल)/i],
  ["tow", /(accident|crash|tow|collision|दुर्घटना)/i],
  ["start", /(won'?t start|not starting|crank|स्टार्ट)/i],
];

export function diagnose(issue: Issue, description: string): Diagnosis {
  let chosen = issue;
  if (issue === "other" && description.trim()) {
    const hit = KEYWORDS.find(([, re]) => re.test(description));
    if (hit) chosen = hit[0];
  }
  const base = RULES[chosen];
  // Agreement between the chosen problem and the description raises confidence one step.
  let confidence = base.confidence;
  if (issue === "other" && chosen !== "other") confidence = "Medium";
  else if (description && KEYWORDS.some(([k, re]) => k === issue && re.test(description)) && confidence === "Medium") confidence = "High";
  return { issue: chosen, ...base, confidence };
}

const NEEDS: Record<Issue, ServiceTag[]> = {
  flat: ["tyre"], battery: ["battery"], heat: ["cooling", "engine"], start: ["battery", "engine", "electrical"],
  fuel: ["fuel"], tow: ["towing"], other: ["engine", "battery", "tyre"],
};

const ISSUE_SPEC: Record<Issue, string> = {
  flat: "Tyre repair", battery: "Battery service", heat: "Cooling & engine", start: "Diagnosis & electrical",
  fuel: "Fuel delivery", tow: "Towing", other: "General repairs",
};

export function recommend(input: RecommendInput): RecommendResult {
  const diagnosis = diagnose(input.issue, input.description);
  const issue = diagnosis.issue;
  const needs = NEEDS[issue];

  const scored = MECHANICS.filter((m) => m.verified && m.online)
    .map((m) => ({ m, d: haversineKm(input, m) }))
    .filter(({ d }) => d <= SEARCH_RADIUS_KM)
    .map(({ m, d }) => {
      const matches = needs.filter((t) => m.tags.includes(t)).length;
      let service = matches / Math.min(needs.length, 2);
      if (input.vehicle === "truck" && !m.tags.includes("heavy") && issue === "tow") service *= 0.3;
      if (input.vehicle === "bike" && m.tags.includes("two_wheeler")) service = Math.min(1, service + 0.2);
      return { m, d, service: Math.min(1, service) };
    })
    .filter((x) => x.service > 0)
    .map(({ m, d, service }) => {
      const distance = 1 - d / SEARCH_RADIUS_KM;
      const rating = Math.max(0, (m.rating - 3.5) / 1.5);
      const arrival = Math.max(0, 1 - m.typical_arrival_min / 30);
      const volume = Math.min(1, Math.log10(m.reviews + 1) / 2.5);
      const score = 0.35 * service + 0.25 * distance + 0.2 * rating + 0.15 * arrival + 0.05 * volume;
      return toRecommendation(m, d, score, issue);
    });

  const bestId = [...scored].sort((a, b) => b.score - a.score)[0]?.mechanic_id;
  const sorted = [...scored].sort((a, b) =>
    input.sort === "nearest" ? a.distance_km - b.distance_km : input.sort === "top" ? b.rating - a.rating : b.score - a.score,
  );
  return {
    radius_km: SEARCH_RADIUS_KM,
    diagnosis,
    mechanics: sorted.slice(0, 5).map((r) => ({ ...r, is_best: r.mechanic_id === bestId })),
  };
}

function toRecommendation(m: SeedMechanic, d: number, score: number, issue: Issue): Recommendation & { score: number } {
  const [pmin, pmax] = m.prices[issue] ?? m.prices.other ?? Object.values(m.prices)[0] ?? [300, 800];
  const tagsShown = m.tags.slice(0, 4).map((t) => TAG_LABEL[t]).join(" · ");
  return {
    mechanic_id: m.id, name: m.name, owner: m.owner, initials: m.initials, rating: m.rating, reviews: m.reviews,
    distance_km: Math.round(d * 10) / 10, eta_min: etaMinutes(d), price_min: pmin, price_max: pmax,
    services_label: tagsShown, vehicle_label: m.vehicle_label, plate: m.plate, verified: m.verified, is_best: false,
    score,
    reasons: [
      { label: "Distance", value: `${(Math.round(d * 10) / 10).toFixed(1)} km from you` },
      { label: "Matching service", value: `${ISSUE_SPEC[issue]} · ${tagsShown}` },
      { label: "Rating", value: `${m.rating}★ from ${m.reviews} jobs` },
      { label: "Typical arrival", value: `Usually arrives in ~${m.typical_arrival_min} min` },
      { label: "Verified", value: "ID, workshop & licence checked" },
    ],
  };
}

export function mechanicById(id: string | null | undefined) {
  return MECHANICS.find((m) => m.id === id) ?? null;
}

export function defaultBill(issue: Issue): { label: string; amount: number }[] {
  const map: Record<Issue, { label: string; amount: number }[]> = {
    flat: [{ label: "Tubeless puncture repair", amount: 300 }, { label: "Roadside call-out", amount: 150 }],
    battery: [{ label: "Jump-start & battery test", amount: 300 }, { label: "Roadside call-out", amount: 150 }],
    heat: [{ label: "Coolant top-up & hose clamp", amount: 650 }, { label: "Roadside call-out", amount: 150 }],
    start: [{ label: "On-site diagnosis & starter fix", amount: 550 }, { label: "Roadside call-out", amount: 150 }],
    fuel: [{ label: "Fuel delivery (5 L, fuel billed separately)", amount: 200 }, { label: "Roadside call-out", amount: 100 }],
    tow: [{ label: "Towing to workshop (12 km)", amount: 1800 }],
    other: [{ label: "Inspection & minor repair", amount: 400 }, { label: "Roadside call-out", amount: 150 }],
  };
  return map[issue];
}
