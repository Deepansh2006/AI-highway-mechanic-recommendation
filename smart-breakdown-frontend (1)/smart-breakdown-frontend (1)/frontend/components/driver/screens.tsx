"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { describePoint, LANDMARKS } from "@/lib/geo";
import type { LocState } from "@/lib/hooks";
import { useNow } from "@/lib/hooks";
import { ACCEPT_WINDOW_S, clock, ISSUES, issueLabel, mmss, priceRange, rupees, SEARCH_RADIUS_KM, VEHICLES, vehicleLabel } from "@/lib/labels";
import type { GeoPoint, Issue, Recommendation, RecommendResult, ServiceRequest, SortKey, Vehicle } from "@/lib/types";
import { Icon, type IconName } from "../Icon";
import { LiveMap } from "../LiveMap";
import { Avatar, ConfidenceMeter, Plate, Rating, SafetyCard, Sheet, Spinner, tintFor, VerifiedBadge } from "../ui";

/* ------------------------------------------------------------------ start */

export function StartScreen() {
  const steps: [IconName, string, string, string, string][] = [
    ["pin", "Share your location", "We find the closest verified mechanics", "var(--amber-tint)", "var(--navy)"],
    ["spark", "Tell us what happened", "AI suggests the right kind of repair", "var(--blue-tint)", "var(--blue)"],
    ["clock", "Track your mechanic", "Live ETA, verified identity, price estimate upfront", "var(--green-tint)", "var(--green)"],
  ];
  return (
    <div className="app-content">
      <section style={{ background: "var(--navy)", color: "#fff", borderRadius: 20, padding: "22px 20px" }} className="stack g10">
        <h1 className="h1">Broken down? Get a verified mechanic to you.</h1>
        <p style={{ color: "#C9D1DC", fontSize: 15, lineHeight: 1.5 }}>
          Share your location, tell us what happened, and track help until it arrives. No sign-in needed.
        </p>
      </section>
      <section aria-label="How it works" className="card" style={{ padding: "6px 16px" }}>
        {steps.map(([icon, t, d, bg, fg], i) => (
          <div key={t} className="row g12" style={{ padding: "12px 0", borderBottom: i < 2 ? "1px solid var(--line-3)" : 0 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Icon name={icon} stroke={fg} />
            </span>
            <span className="stack"><b>{t}</b><span className="small muted">{d}</span></span>
          </div>
        ))}
      </section>
      <div className="row g10" style={{ background: "var(--red-tint)", border: "1px solid var(--red-line)", borderRadius: 14, padding: "10px 12px 10px 14px" }}>
        <span className="grow bold small" style={{ color: "#6E0A1A" }}>Accident or someone hurt?</span>
        <a href="tel:112" className="sos" style={{ fontFamily: "var(--font-body)", letterSpacing: 0, fontSize: 14 }}>Call 112</a>
      </div>
      <div className="stack g4">
        <Link href="/feedback" className="row between bold small" style={{ minHeight: 44, textDecoration: "none", color: "var(--navy-2)" }}>
          Got help earlier? Rate your mechanic <Icon name="chevronRight" size={18} />
        </Link>
        <Link href="/login" className="row between bold small" style={{ minHeight: 44, textDecoration: "none", color: "var(--navy-2)" }}>
          Mechanic or control room? Sign in <Icon name="chevronRight" size={18} />
        </Link>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- location */

type Geo = {
  state: LocState;
  point: GeoPoint | null;
  detect: () => void;
  setManual: (p: GeoPoint) => void;
  setState: (s: LocState) => void;
  demoSubstituted: boolean;
};

export function LocationScreen({ geo, landmark, setLandmark }: { geo: Geo; landmark: string; setLandmark: (v: string) => void }) {
  const { state, point } = geo;
  const desc = point ? describePoint(point) : null;
  const weak = state === "weak";

  if (state === "manual" && !point) return <ManualLocation geo={geo} />;
  if (state === "manual") return <ManualLocation geo={geo} />;

  if (state === "denied" || state === "unavailable") {
    return (
      <div className="app-content">
        <div className="stack center g12" style={{ alignItems: "center", padding: "24px 8px 8px" }}>
          <span style={{ width: 80, height: 80, borderRadius: "50%", background: "#E9EDF1", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="pinOff" size={38} stroke="var(--navy-2)" />
          </span>
          <h2 className="h2">{state === "denied" ? "Location access is off" : "Couldn't get a GPS fix"}</h2>
          <p className="muted" style={{ maxWidth: 300 }}>
            {state === "denied"
              ? "Allow location so we can find mechanics near you, or type where you are instead."
              : "Your phone couldn't find its position. Try again in the open, or type where you are."}
          </p>
        </div>
        {state === "denied" && (
          <ol className="card" style={{ padding: "14px 16px 14px 34px", display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <li>Tap the lock icon next to the web address</li>
            <li>Set <b>Location</b> to <b>Allow</b></li>
            <li>Come back and tap <b>Try again</b></li>
          </ol>
        )}
      </div>
    );
  }

  return (
    <div className="app-content">
      <LiveMap height={200} ariaLabel="Map around your location" interactive={false}
        markers={point ? [{ id: "you", kind: "you", lat: point.lat, lng: point.lng, title: "You are here" }] : []}
        accuracy={point && point.accuracy_m ? { lat: point.lat, lng: point.lng, radius: Math.min(point.accuracy_m, 600) } : undefined}
        padding={60}>
        {state === "detecting" && (
          <div style={{ position: "absolute", inset: 0, zIndex: 600, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(233,237,241,.7)" }}>
            <Spinner size={48} color="var(--blue)" />
            <span className="bold small" style={{ background: "#fff", padding: "6px 12px", borderRadius: 999 }}>Locating you…</span>
          </div>
        )}
        {point && state !== "detecting" && (
          <span className="map-chip" style={{ color: weak ? "var(--amber-ink)" : "var(--green)" }}>
            <span className="dot" style={{ background: weak ? "#E39A0E" : "var(--green)" }} />
            {weak ? "Weak GPS" : "GPS"} · accuracy ~{point.accuracy_m ?? "?"} m
          </span>
        )}
      </LiveMap>

      {state === "detecting" || !point ? (
        <div className="stack g8">
          <h2 className="h2">Finding your location</h2>
          <p className="muted">We use it only to find the mechanics closest to you. Keep GPS on and stay where you are.</p>
          <div className="skeleton" style={{ height: 14, width: "70%", marginTop: 6 }} />
          <div className="skeleton" style={{ height: 14, width: "45%" }} />
        </div>
      ) : (
        <div className="stack g12">
          <h2 className="h2">Is this location correct?</h2>
          <div className="card row g12" style={{ padding: 14, alignItems: "flex-start" }}>
            <Icon name="pin" size={22} stroke="var(--blue)" style={{ marginTop: 2 }} />
            <div className="stack g4" style={{ minWidth: 0 }}>
              <b style={{ fontSize: 16 }}>{desc?.title}</b>
              <span className="small muted">{desc?.subtitle}</span>
              <span className="small muted">We use this to find mechanics within {SEARCH_RADIUS_KM} km.</span>
            </div>
          </div>
          {geo.demoSubstituted && (
            <p className="note small">Demo: you&apos;re outside Jaipur, so a sample location on NH-48 is used.</p>
          )}
          {weak && (
            <p className="note" style={{ background: "var(--amber-soft)" }}>
              GPS is approximate. Add a landmark or set the pin on the map so the mechanic can find you.
            </p>
          )}
          <div className="field">
            <label htmlFor="landmark" className="label">Nearby landmark <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></label>
            <input id="landmark" className="input" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Petrol pump, dhaba, km stone…" />
          </div>
          <div className="grid2">
            <button type="button" className="btn" onClick={geo.detect}><Icon name="locate" size={17} />Re-detect</button>
            <button type="button" className="btn" onClick={() => geo.setState("manual")}><Icon name="map" size={17} />Set on map</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualLocation({ geo }: { geo: Geo }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return LANDMARKS.filter((l) => !s || `${l.name} ${l.road}`.toLowerCase().includes(s)).slice(0, 6);
  }, [q]);
  const chosen = geo.point;
  return (
    <div className="app-content">
      <h2 className="h2">Where are you?</h2>
      <label htmlFor="loc-search" className="sr-only">Search highway, km stone or landmark</label>
      <div className="input-group" style={{ height: 52 }}>
        <span style={{ background: "transparent", border: 0, paddingRight: 0 }}><Icon name="search" stroke="var(--muted)" /></span>
        <input id="loc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Highway, km stone or landmark" autoComplete="off" />
      </div>
      <span className="kicker muted">{q ? "Matches" : "Places on Jaipur highways"}</span>
      <div className="card" style={{ overflow: "hidden" }} role="listbox" aria-label="Locations">
        {results.length === 0 && <p className="muted small" style={{ padding: 14 }}>No matching place. Try a nearby town or highway name.</p>}
        {results.map((l) => {
          const on = !!chosen && Math.abs(chosen.lat - l.lat) < 1e-6 && Math.abs(chosen.lng - l.lng) < 1e-6;
          return (
            <button key={l.name} type="button" role="option" aria-selected={on}
              onClick={() => geo.setManual({ lat: l.lat, lng: l.lng, label: `${l.name}, ${l.road}`, accuracy_m: null })}
              style={{ width: "100%", minHeight: 60, padding: "10px 14px", border: 0, borderBottom: "1px solid var(--line-3)", background: on ? "var(--amber-tint)" : "#fff", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
              <Icon name="pin" size={18} />
              <span className="stack grow"><b>{l.name}</b><span className="small muted">{l.road}</span></span>
              {on && <Icon name="check" stroke="var(--green)" width={2.6} />}
            </button>
          );
        })}
      </div>
      <button type="button" className="btn" onClick={geo.detect}><Icon name="locate" size={17} />Use my GPS location instead</button>
    </div>
  );
}

/* ---------------------------------------------------------------- problem */

const VEH_ICON: Record<Vehicle, IconName> = { car: "car", bike: "bike", auto: "auto", truck: "truck" };
const ISSUE_ICON: Record<Issue, IconName> = { flat: "tyre", battery: "battery", heat: "heat", start: "power", fuel: "fuel", tow: "tow", other: "question" };

export function ProblemScreen({ vehicle, setVehicle, issue, setIssue, description, setDescription }: {
  vehicle: Vehicle; setVehicle: (v: Vehicle) => void; issue: Issue | null; setIssue: (i: Issue) => void; description: string; setDescription: (s: string) => void;
}) {
  const [open, setOpen] = useState(!!description);
  const [voice, setVoice] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  return (
    <div className="app-content" style={{ gap: 18 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack g10">
        <legend className="h3" style={{ marginBottom: 10 }}>Your vehicle</legend>
        <div className="grid4">
          {VEHICLES.map((v) => (
            <button key={v.key} type="button" className="tile tile-col" aria-pressed={vehicle === v.key} onClick={() => setVehicle(v.key)}>
              <Icon name={VEH_ICON[v.key]} size={26} />{v.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack g10">
        <legend className="h3" style={{ marginBottom: 10 }}>What happened?</legend>
        <div className="grid2">
          {ISSUES.map((i) => (
            <button key={i.key} type="button" className={`tile${i.key === "other" ? " span2" : ""}`} aria-pressed={issue === i.key} onClick={() => setIssue(i.key)}>
              <Icon name={ISSUE_ICON[i.key]} size={22} />
              {i.key === "other" ? "Not sure · get a general check" : i.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="card" style={{ overflow: "hidden" }}>
        <button type="button" aria-expanded={open} aria-controls="details" onClick={() => setOpen((v) => !v)}
          style={{ width: "100%", minHeight: 60, padding: "10px 14px", border: 0, background: "transparent", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
          <span className="stack grow">
            <b>Add details <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></b>
            <span className="small muted">Describe in Hindi or English, voice note or photo</span>
          </span>
          <Icon name="chevron" width={2.2} style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
        {open && (
          <div id="details" className="stack g10" style={{ padding: "0 14px 14px" }}>
            <label htmlFor="desc" className="sr-only">Describe the problem</label>
            <textarea id="desc" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Loud bang from rear left wheel, car pulling to one side" />
            <div className="grid2">
              <button type="button" className="btn" aria-pressed={voice} onClick={() => setVoice((v) => !v)}>
                <Icon name="mic" size={18} />{voice ? "Voice note added" : "Voice note"}
              </button>
              <label className="btn" style={{ cursor: "pointer" }}>
                <Icon name="camera" size={18} />{photo ? "Photo added" : "Add photo"}
                <input type="file" accept="image/*" capture="environment" className="sr-only"
                  onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? null)} />
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- diagnosis */

export function DiagnosisScreen({ loading, error, result, vehicle, issue, onEdit, onRetry }: {
  loading: boolean; error: string | null; result: RecommendResult | null; vehicle: Vehicle; issue: Issue | null; onEdit: () => void; onRetry: () => void;
}) {
  return (
    <div className="app-content">
      <div className="card row g10" style={{ padding: "8px 8px 8px 14px" }}>
        <span className="grow small bold">{vehicleLabel(vehicle)} · {issue ? issueLabel(issue) : ""}</span>
        <button type="button" className="btn btn-sm" onClick={onEdit}>Edit</button>
      </div>
      {loading && (
        <section className="ai-card stack g12" style={{ padding: 18 }} aria-busy="true">
          <div className="row g10"><Spinner color="var(--blue)" /><span className="kicker" style={{ color: "var(--blue-ink)" }}>Analysing your problem…</span></div>
          <div className="skeleton" style={{ height: 22, width: "80%" }} />
          <div className="skeleton" style={{ height: 14, width: "60%" }} />
          <div className="skeleton" style={{ height: 56 }} />
        </section>
      )}
      {error && !loading && (
        <div className="warn" role="alert">
          <Icon name="info" stroke="var(--warn-ink)" />
          <span className="grow">{error}</span>
          <button type="button" className="btn btn-sm" onClick={onRetry}>Try again</button>
        </div>
      )}
      {result && !loading && (
        <section aria-labelledby="ai-title" className="ai-card stack g14" style={{ padding: 18 }}>
          <div className="row g10">
            <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="spark" size={19} stroke="#fff" />
            </span>
            <span className="kicker" style={{ color: "var(--blue-ink)" }}>AI quick diagnosis</span>
          </div>
          <h2 id="ai-title" className="h2" style={{ fontSize: 23 }}>{result.diagnosis.title}</h2>
          <ConfidenceMeter level={result.diagnosis.confidence} />
          <div className="stack g4" style={{ background: "#fff", borderRadius: 14, padding: "12px 14px" }}>
            <span className="kicker muted">Recommended service</span>
            <b style={{ fontSize: 17 }}>{result.diagnosis.service}</b>
          </div>
          <p>{result.diagnosis.body}</p>
          <div className="row g8 small" style={{ borderTop: "1px solid var(--blue-line)", paddingTop: 12, color: "var(--navy-2)", alignItems: "flex-start" }}>
            <Icon name="shield" size={16} stroke="var(--blue-ink)" style={{ marginTop: 1 }} />
            <span>A suggestion, not a final diagnosis. Your mechanic will confirm on arrival.</span>
          </div>
        </section>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- mechanics */

export function MechanicsScreen({ result, list, sort, setSort, onRequest }: {
  result: RecommendResult; list: Recommendation[]; sort: SortKey; setSort: (s: SortKey) => void; onRequest: (r: Recommendation) => void;
}) {
  const [why, setWhy] = useState<string | null>(null);
  if (!list.length) {
    return (
      <div className="app-content">
        <div className="card card-pad stack g10">
          <h2 className="h2">No verified mechanics free within {result.radius_km} km</h2>
          <p className="muted">Mechanics come online throughout the day. You can try again in a minute, or call for help now.</p>
          <a className="btn btn-dark btn-lg" href="tel:1033"><Icon name="phone" />Call NHAI helpline 1033</a>
          <a className="btn" href="tel:112">Emergency 112</a>
        </div>
      </div>
    );
  }
  return (
    <div className="app-content" style={{ gap: 12 }}>
      <div className="row g8 small" style={{ background: "var(--blue-tint)", borderRadius: 12, padding: "10px 12px" }}>
        <Icon name="spark" size={16} stroke="var(--blue)" width={2.2} />
        <span><b>{result.diagnosis.service}</b> · {result.diagnosis.confidence} confidence</span>
      </div>
      <div role="group" aria-label="Sort mechanics" className="seg" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        {([["best", "Best match"], ["nearest", "Nearest"], ["top", "Top rated"]] as [SortKey, string][]).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
        ))}
      </div>
      <span className="small muted">{list.length} verified mechanic{list.length > 1 ? "s" : ""} within {result.radius_km} km</span>
      {list.map((m) => {
        const open = why === m.mechanic_id;
        return (
          <article key={m.mechanic_id} className="card stack g12" style={{ padding: 14, borderWidth: 2, borderColor: m.is_best ? "var(--amber)" : "var(--line)", borderRadius: 18 }}>
            {m.is_best && <span className="badge b-best" style={{ alignSelf: "flex-start" }}>Best match for {issueLabel(result.diagnosis.issue).toLowerCase()}</span>}
            <div className="row g12">
              <Avatar initials={m.initials} tint={tintFor(m.initials)} label={`Photo of ${m.owner}, ${m.name}`} />
              <div className="stack g4 grow">
                <h3 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>{m.name}</h3>
                <div className="row g8 wrap">{m.verified && <VerifiedBadge />}<Rating value={m.rating} count={m.reviews} /></div>
                <span className="tiny muted">{m.vehicle_label} · {m.plate}</span>
              </div>
            </div>
            <div className="grid3 soft" style={{ padding: "10px 4px", gap: 0 }}>
              <Stat value={`${m.distance_km} km`} label="away" />
              <Stat value={`~${m.eta_min} min`} label="to reach you" bordered />
              <Stat value={priceRange(m.price_min, m.price_max)} label="estimate" />
            </div>
            <span className="small" style={{ color: "var(--navy-2)" }}>{m.services_label}</span>
            <button type="button" className="link-btn" aria-expanded={open} onClick={() => setWhy(open ? null : m.mechanic_id)} style={{ alignSelf: "flex-start" }}>
              <Icon name="spark" size={15} width={2.2} />Why this mechanic?
              <Icon name="chevron" size={16} width={2.4} style={{ transform: open ? "rotate(180deg)" : "none" }} />
            </button>
            {open && (
              <ul style={{ listStyle: "none", padding: 12, background: "var(--blue-tint)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, marginTop: -4 }}>
                {m.reasons.map((r) => (
                  <li key={r.label} className="row g8" style={{ alignItems: "flex-start" }}>
                    <Icon name="check" size={16} stroke="var(--green)" width={2.8} style={{ marginTop: 2 }} />
                    <span><b>{r.label}</b> · {r.value}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn btn-dark btn-lg" onClick={() => onRequest(m)}>Request Help</button>
          </article>
        );
      })}
    </div>
  );
}

function Stat({ value, label, bordered }: { value: string; label: string; bordered?: boolean }) {
  return (
    <span className="stack center" style={{ alignItems: "center", gap: 2, borderLeft: bordered ? "1px solid var(--line)" : 0, borderRight: bordered ? "1px solid var(--line)" : 0 }}>
      <b style={{ fontSize: 15 }}>{value}</b><span className="tiny muted">{label}</span>
    </span>
  );
}

/* ---------------------------------------------------------- request flow */

export function RequestScreens({ request, busy, onCancel, onConfirmMechanic, onRetry }: {
  request: ServiceRequest; busy: boolean; onCancel: () => void; onConfirmMechanic: () => void; onRetry: () => void;
}) {
  switch (request.status) {
    case "pending": return <Waiting r={request} />;
    case "en_route": return <Tracking r={request} onCancel={onCancel} />;
    case "arrived": return <Arrived r={request} busy={busy} onConfirm={onConfirmMechanic} />;
    case "repairing": return <Arrived r={request} busy={busy} onConfirm={onConfirmMechanic} />;
    case "billing": return <Billing r={request} />;
    case "completed": return <Completed r={request} />;
    case "unassigned":
      return (
        <div className="app-content">
          <div className="card card-pad stack g10">
            <h2 className="h2">No mechanic accepted yet</h2>
            <p className="muted">Every verified mechanic nearby is busy right now. Try again, or call the highway helpline.</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={onRetry}>Start a new request</button>
            <a className="btn" href="tel:1033"><Icon name="phone" />Call NHAI 1033</a>
          </div>
        </div>
      );
    default:
      return (
        <div className="app-content">
          <div className="card card-pad stack g10"><h2 className="h2">This request was cancelled</h2>
            <button type="button" className="btn btn-primary btn-lg" onClick={onRetry}>Start again</button></div>
        </div>
      );
  }
}

function MechRow({ r, size = 48 }: { r: ServiceRequest; size?: number }) {
  return (
    <div className="card row g12" style={{ padding: "12px 14px" }}>
      <Avatar initials={r.mechanic_initials ?? "?"} size={size} tint={tintFor(r.mechanic_initials)} label={`Photo of ${r.mechanic_owner ?? "mechanic"}`} />
      <span className="stack grow">
        <b>{r.mechanic_name}</b>
        <span className="small muted">{r.distance_km} km · ~{r.eta_min} min · {priceRange(r.price_min, r.price_max)}</span>
      </span>
    </div>
  );
}

function Waiting({ r }: { r: ServiceRequest }) {
  const now = useNow(1000);
  const left = r.accept_deadline ? Math.max(0, (r.accept_deadline - now) / 1000) : ACCEPT_WINDOW_S;
  const circ = 2 * Math.PI * 64;
  return (
    <div className="app-content" style={{ paddingTop: 20, gap: 16 }}>
      <div className="stack center g14" style={{ alignItems: "center" }}>
        <div style={{ position: "relative", width: 148, height: 148 }} role="timer" aria-label={`${Math.ceil(left)} seconds left for the mechanic to accept`}>
          <svg width="148" height="148" viewBox="0 0 148 148" aria-hidden="true">
            <circle cx="74" cy="74" r="64" fill="#fff" stroke="var(--line)" strokeWidth="10" />
            <circle cx="74" cy="74" r="64" fill="none" stroke="var(--amber)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${(circ * left) / ACCEPT_WINDOW_S} ${circ}`} transform="rotate(-90 74 74)" />
          </svg>
          <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <b className="num" style={{ fontSize: 34 }}>{mmss(left)}</b><span className="tiny muted">to accept</span>
          </span>
        </div>
        <h2 className="h2" style={{ fontSize: 24 }} aria-live="polite">{r.reassigned ? "Trying the next best mechanic…" : "Finding your mechanic…"}</h2>
        <p className="muted" style={{ maxWidth: 320 }}>Request sent to <b style={{ color: "var(--navy)" }}>{r.mechanic_name}</b>. Waiting for them to accept.</p>
      </div>
      {r.reassigned && (
        <div className="warn" role="status">
          <Icon name="retry" stroke="var(--amber-ink)" width={2.2} />
          <span>{r.previous_mechanic_name ?? "The first mechanic"} couldn&apos;t take it, so we&apos;ve sent your request to the next best mechanic. You don&apos;t need to do anything.</span>
        </div>
      )}
      <MechRow r={r} />
      <span className="small muted center">Request {r.id} · {vehicleLabel(r.vehicle)} · {issueLabel(r.issue)}</span>
      <SafetyCard defaultOpen />
    </div>
  );
}

const TIMELINE = ["Request sent", "Mechanic accepted", "Contact unlocked", "On the way", "Arrived", "Repair completed"];

function Timeline({ current }: { current: number }) {
  return (
    <section aria-label="Request progress" className="card" style={{ padding: "14px 16px" }}>
      <ol className="timeline">
        {TIMELINE.map((label, i) => {
          const st = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={label} aria-current={st === "current" ? "step" : undefined}>
              <div className="tl-rail">
                <span className={`tl-dot ${st}`}>{st === "done" && <Icon name="check" size={13} stroke="#fff" width={3.2} />}</span>
                {i < TIMELINE.length - 1 && <span className={`tl-line ${i < current ? "done" : ""}`} />}
              </div>
              <div className="tl-text">
                <span style={{ fontWeight: st === "current" ? 700 : 600, color: st === "todo" ? "var(--muted)" : "var(--navy)" }}>
                  {label}<span className="sr-only"> — {st === "done" ? "done" : st === "current" ? "in progress" : "not started"}</span>
                </span>
                {st === "current" && i === 3 && <span className="small muted">Live location updates every few seconds</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Tracking({ r, onCancel }: { r: ServiceRequest; onCancel: () => void }) {
  const now = useNow(15000);
  const eta = r.eta_min ?? 0;
  const ml = r.mechanic_location;
  return (
    <div className="stack">
      <LiveMap height="clamp(240px, 35vh, 380px)" radius={0} ariaLabel={`Live map: ${r.mechanic_name} driving towards you`} interactive
        markers={[
          { id: "you", kind: "you", lat: r.location.lat, lng: r.location.lng, title: "You" },
          ...(ml ? [{ id: "mech", kind: "mech" as const, lat: ml.lat, lng: ml.lng, title: r.mechanic_name ?? "Mechanic" }] : []),
        ]}
        route={ml ? [[ml.lat, ml.lng], [r.location.lat, r.location.lng]] : undefined} padding={50}>
        <span className="map-chip"><span className="dot" style={{ background: "var(--green)" }} />Live · updates every few seconds</span>
      </LiveMap>
      <div className="app-content" style={{ marginTop: -22, position: "relative", zIndex: 600 }}>
        <section className="card stack g14" style={{ padding: 16, borderRadius: 20, boxShadow: "var(--shadow)" }}>
          <div className="row between" style={{ alignItems: "baseline", gap: 8 }}>
            <span className="num" style={{ fontSize: 34, lineHeight: 1 }} aria-live="polite">{eta <= 1 ? "Arriving now" : `${eta} min away`}</span>
            <span className="small muted" style={{ textAlign: "right" }}>Arrives ~{clock(now + eta * 60000)}</span>
          </div>
          <div className="row g12" style={{ borderTop: "1px solid var(--line-3)", paddingTop: 14 }}>
            <Avatar initials={r.mechanic_initials ?? "?"} tint={tintFor(r.mechanic_initials)} label={`Photo of ${r.mechanic_owner}`} />
            <div className="stack g4 grow">
              <b style={{ fontSize: 16 }}>{r.mechanic_name}</b>
              <span className="row g8 wrap"><VerifiedBadge />{r.mechanic_rating && <Rating value={r.mechanic_rating} />}</span>
            </div>
            {r.mechanic_plate && <Plate>{r.mechanic_plate}</Plate>}
          </div>
          <span className="small muted">{r.mechanic_owner} · {r.mechanic_vehicle_label} · Request {r.id}</span>
        </section>
        <Timeline current={3} />
        <SafetyCard />
        <button type="button" className="underline-btn" style={{ alignSelf: "center" }} onClick={onCancel}>Cancel request</button>
      </div>
    </div>
  );
}

function Arrived({ r, busy, onConfirm }: { r: ServiceRequest; busy: boolean; onConfirm: () => void }) {
  const verified = r.status === "repairing";
  return (
    <div className="app-content" style={{ paddingTop: 20 }}>
      <div className="row g12">
        <span style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--green-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={verified ? "wrench" : "pin"} size={24} stroke="var(--green)" width={2.4} />
        </span>
        <div className="stack">
          <h2 className="h2" style={{ fontSize: 23 }}>{verified ? "Repair in progress" : "Your mechanic has arrived"}</h2>
          {r.arrived_at && <span className="small muted">Arrived {clock(r.arrived_at)} · {Math.max(1, Math.round((r.arrived_at - r.created_at) / 60000))} min after request</span>}
        </div>
      </div>
      <section className="card stack g12" style={{ padding: 16, borderRadius: 20 }}>
        <div className="row g14">
          <Avatar initials={r.mechanic_initials ?? "?"} size={72} tint={tintFor(r.mechanic_initials)} label={`Photo of ${r.mechanic_owner}`} />
          <div className="stack g4">
            <b style={{ fontSize: 17 }}>{r.mechanic_owner}</b>
            <span className="small muted">{r.mechanic_name}</span>
            <span style={{ alignSelf: "flex-start" }}><VerifiedBadge text="ID verified" /></span>
          </div>
        </div>
        <div className="row between soft" style={{ padding: "10px 12px" }}>
          <span className="small" style={{ color: "var(--navy-2)" }}>{r.mechanic_vehicle_label}</span>
          {r.mechanic_plate && <Plate>{r.mechanic_plate}</Plate>}
        </div>
      </section>
      {!verified ? (
        <section aria-labelledby="verify-h" className="stack g12" style={{ background: "var(--navy)", color: "#fff", borderRadius: 20, padding: 18 }}>
          <h3 id="verify-h" style={{ fontSize: 16 }}>Verify before handing over keys</h3>
          <p style={{ fontSize: 14, color: "#C9D1DC" }}>Check the face and number plate match. Then tell the mechanic this code — their app confirms it.</p>
          <div className="code-boxes" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }} aria-label={`Verification code ${r.verification_code.split("").join(" ")}`}>
            {r.verification_code.split("").map((d, i) => <span key={i} className="code-box" style={{ color: "var(--navy)", border: 0 }}>{d}</span>)}
          </div>
          <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={onConfirm}>{busy ? <Spinner /> : "Confirm Mechanic"}</button>
          <Link href="/sos" className="center bold" style={{ color: "#FFB3BE", minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>This isn&apos;t my mechanic</Link>
        </section>
      ) : (
        <section role="status" className="stack g10" style={{ background: "var(--green-tint)", border: "1px solid var(--green-line)", borderRadius: 20, padding: 16 }}>
          <b className="row g8"><Icon name="check" stroke="var(--green)" width={2.8} />Mechanic confirmed · repair in progress</b>
          <div style={{ height: 8, borderRadius: 4, background: "#fff", overflow: "hidden" }}><div className="skeleton" style={{ width: "100%", height: "100%", background: "var(--green)", opacity: 0.7 }} /></div>
          <span className="small" style={{ color: "var(--navy-2)" }}>Agreed estimate {priceRange(r.price_min, r.price_max)}. Any extra work needs your OK first.</span>
          {r.mechanic_phone && <a className="btn" href={`tel:${r.mechanic_phone}`}><Icon name="phone" size={18} />Call mechanic</a>}
        </section>
      )}
    </div>
  );
}

function Billing({ r }: { r: ServiceRequest }) {
  const within = r.final_amount != null && r.price_max != null && r.final_amount <= r.price_max;
  return (
    <div className="app-content" style={{ paddingTop: 20 }}>
      <h2 className="h2">Check your bill</h2>
      <p className="muted">{r.mechanic_name} has finished and sent the bill. Pay the mechanic by {r.payment_method === "cash" ? "cash" : "UPI"}, then confirm below.</p>
      <section className="card" style={{ padding: "6px 16px" }}>
        {r.line_items.map((li) => (
          <div key={li.label} className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--line-3)" }}><span>{li.label}</span><b>{rupees(li.amount)}</b></div>
        ))}
        <div className="row between" style={{ padding: "14px 0", alignItems: "center" }}>
          <span className="stack g4"><span className="muted">Total</span>
            <span className={`badge ${within ? "b-green" : "b-amber"}`}>{within ? "Within" : "Above"} estimate {priceRange(r.price_min, r.price_max)}</span></span>
          <b className="num" style={{ fontSize: 30 }}>{rupees(r.final_amount ?? 0)}</b>
        </div>
      </section>
      {!within && <p className="note">The total is above the estimate. Ask the mechanic to explain the extra work before you pay. You can report it afterwards.</p>}
    </div>
  );
}

function Completed({ r }: { r: ServiceRequest }) {
  return (
    <div className="app-content" style={{ paddingTop: 24, gap: 16 }}>
      <div className="stack center g10" style={{ alignItems: "center" }}>
        <span style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" size={38} stroke="#fff" width={2.8} />
        </span>
        <h2 className="h1">Repair Completed</h2>
        <span className="small muted">You&apos;re good to go. Drive safe.</span>
      </div>
      <section className="card" style={{ padding: "6px 16px" }}>
        <div className="row g12" style={{ padding: "12px 0", borderBottom: "1px solid var(--line-3)" }}>
          <Avatar initials={r.mechanic_initials ?? "?"} size={44} tint={tintFor(r.mechanic_initials)} label={`Photo of ${r.mechanic_owner}`} />
          <span className="stack grow"><b>{r.mechanic_name}</b><span className="small muted">{r.mechanic_owner} · Verified</span></span>
        </div>
        <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--line-3)" }}><span className="muted">Service</span><b>{r.line_items[0]?.label ?? r.diagnosis.service}</b></div>
        <div className="row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--line-3)" }}><span className="muted">Request</span><b>{r.id}{r.completed_at ? ` · ${clock(r.completed_at)}` : ""}</b></div>
        <div className="row between" style={{ padding: "14px 0" }}>
          <span className="stack g4"><span className="muted">Final amount</span><span className="badge b-green">Estimate {priceRange(r.price_min, r.price_max)}</span></span>
          <span className="stack" style={{ alignItems: "flex-end" }}>
            <b className="num" style={{ fontSize: 28 }}>{rupees(r.final_amount ?? 0)}</b>
            <span className="small bold" style={{ color: "var(--green)" }}>Payment confirmed · {r.payment_method === "cash" ? "Cash" : "UPI"}</span>
          </span>
        </div>
      </section>
      <p className="small muted center">Your rating helps the next stranded driver get the right mechanic.</p>
    </div>
  );
}

/* ------------------------------------------------------------- bottom bar */

export function BottomBar(p: {
  screen: string; geoState: LocState; hasPoint: boolean; issueChosen: boolean; request: ServiceRequest | null; best: Recommendation | null;
  hasResults: boolean; loadingRec: boolean; busy: boolean;
  onStart: () => void; onDetect: () => void; onManual: () => void; onConfirmLocation: () => void; onContinue: () => void;
  onShowMechanics: () => void; onRequestBest: () => void; onCancel: () => void; onConfirmPayment: () => void; onReceipt: () => void; onDone: () => void;
}) {
  let content: ReactNode = null;
  const s = p.screen;
  if (s === "start") {
    content = (
      <>
        <button type="button" className="btn btn-primary btn-xl" onClick={p.onStart}><Icon name="nav" size={22} width={2.3} />Find a Mechanic Near Me</button>
        <span className="tiny muted center">Uses your location to find help nearby</span>
      </>
    );
  } else if (s === "location") {
    if (p.geoState === "detecting" || p.geoState === "idle") {
      content = (
        <>
          <button type="button" className="btn btn-primary btn-lg" disabled>Detecting location…</button>
          <button type="button" className="underline-btn" onClick={p.onManual}>Enter location manually</button>
        </>
      );
    } else if (p.geoState === "denied" || p.geoState === "unavailable") {
      content = (
        <>
          <button type="button" className="btn btn-primary btn-lg" onClick={p.onDetect}>Try Again</button>
          <button type="button" className="btn" onClick={p.onManual}>Enter location manually</button>
        </>
      );
    } else {
      content = <button type="button" className="btn btn-primary btn-lg" disabled={!p.hasPoint} onClick={p.onConfirmLocation}>Confirm Location</button>;
    }
  } else if (s === "problem") {
    content = (
      <>
        <button type="button" className="btn btn-primary btn-lg" disabled={!p.issueChosen} onClick={p.onContinue}>Continue</button>
        {!p.issueChosen && <span className="tiny muted center">Choose what happened to continue</span>}
      </>
    );
  } else if (s === "diagnosis") {
    content = <button type="button" className="btn btn-primary btn-lg" disabled={p.loadingRec || !p.hasResults} onClick={p.onShowMechanics}>Show Mechanics</button>;
  } else if (s === "mechanics" && p.best) {
    content = (
      <button type="button" className="btn btn-primary btn-xl" style={{ flexDirection: "column", gap: 0 }} onClick={p.onRequestBest}>
        <span>Request Best Match</span><span className="small" style={{ fontWeight: 600 }}>{p.best.name} · ~{p.best.eta_min} min</span>
      </button>
    );
  } else if (s === "request" && p.request) {
    const r = p.request;
    if (r.status === "pending") content = <button type="button" className="btn btn-lg" onClick={p.onCancel}>Cancel request</button>;
    else if (r.status === "en_route" || r.status === "repairing") {
      content = (
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 10 }}>
          <a className="btn btn-primary btn-lg" href={`tel:${r.mechanic_phone ?? ""}`}><Icon name="phone" />Call mechanic</a>
          <ShareButton r={r} />
        </div>
      );
    } else if (r.status === "billing") {
      content = <button type="button" className="btn btn-primary btn-lg" disabled={p.busy} onClick={p.onConfirmPayment}>{p.busy ? <Spinner /> : `I've paid ${rupees(r.final_amount ?? 0)}`}</button>;
    } else if (r.status === "completed") {
      content = (
        <>
          <Link className="btn btn-primary btn-lg" href={`/feedback?request=${r.id}`}>Rate Mechanic</Link>
          <div className="grid2">
            <button type="button" className="btn" onClick={p.onReceipt}>View Receipt</button>
            <button type="button" className="btn" onClick={p.onDone}>Done</button>
          </div>
        </>
      );
    }
  }
  if (!content) return null;
  return <div className="bottom-bar">{content}</div>;
}

function ShareButton({ r }: { r: ServiceRequest }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = `I've broken down at ${r.location.label ?? "my location"}. ${r.mechanic_name} (${r.mechanic_plate}) is on the way. Request ${r.id}. Map: https://maps.google.com/?q=${r.location.lat},${r.location.lng}`;
    try {
      if (navigator.share) await navigator.share({ title: "My live location", text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* user cancelled */ }
  };
  return <button type="button" className="btn btn-lg" onClick={share}><Icon name="share" size={18} />{copied ? "Copied" : "Share"}</button>;
}

/* ----------------------------------------------------------------- sheets */

export function ConfirmSheet({ rec, service, place, sending, onClose, onSend }: {
  rec: Recommendation | null; service: string; place: string; sending: boolean; onClose: () => void; onSend: () => void;
}) {
  return (
    <Sheet open={!!rec} onClose={onClose} labelledBy="confirm-h">
      {rec && (
        <>
          <h2 id="confirm-h" className="h2">Confirm your request</h2>
          <div className="row g12">
            <Avatar initials={rec.initials} size={52} tint={tintFor(rec.initials)} label={`Photo of ${rec.owner}`} />
            <span className="stack g4"><b style={{ fontSize: 16 }}>{rec.name}</b><span className="small bold" style={{ color: "var(--green)" }}>Verified · ★ {rec.rating}</span></span>
          </div>
          <dl className="soft" style={{ margin: 0, padding: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: "10px 12px" }}>
            <dt className="muted">Service</dt><dd style={{ margin: 0, textAlign: "right" }} className="bold">{service}</dd>
            <dt className="muted">Arrives in</dt><dd style={{ margin: 0, textAlign: "right" }} className="bold">~{rec.eta_min} min</dd>
            <dt className="muted">Estimated price</dt><dd style={{ margin: 0, textAlign: "right" }} className="bold">{priceRange(rec.price_min, rec.price_max)}</dd>
            <dt className="muted">Your location</dt><dd style={{ margin: 0, textAlign: "right" }} className="bold">{place}</dd>
          </dl>
          <p className="small muted">Your location and phone number go only to this mechanic. The final price is agreed before any work starts.</p>
          <button type="button" className="btn btn-primary btn-xl" disabled={sending} onClick={onSend}>{sending ? <><Spinner />Sending…</> : "Request Help"}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Not now</button>
        </>
      )}
    </Sheet>
  );
}

export function ReceiptSheet({ open, request: r, onClose }: { open: boolean; request: ServiceRequest | null; onClose: () => void }) {
  return (
    <Sheet open={open && !!r} onClose={onClose} labelledBy="receipt-h">
      {r && (
        <>
          <div className="row between" style={{ alignItems: "baseline" }}>
            <h2 id="receipt-h" className="h2">Receipt</h2>
            <span className="small muted">{r.id}{r.completed_at ? ` · ${new Date(r.completed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span>
          </div>
          <div className="stack g4 small" style={{ color: "var(--navy-2)" }}><b style={{ color: "var(--navy)", fontSize: 15 }}>{r.mechanic_name}</b><span>{r.mechanic_owner} · {r.mechanic_plate}</span></div>
          <div className="stack g10" style={{ borderTop: "1px dashed var(--line-2)", borderBottom: "1px dashed var(--line-2)", padding: "12px 0" }}>
            {r.line_items.map((li) => <div key={li.label} className="row between"><span>{li.label}</span><span>{rupees(li.amount)}</span></div>)}
          </div>
          <div className="row between" style={{ alignItems: "baseline" }}><b>Total paid</b><b className="num" style={{ fontSize: 26 }}>{rupees(r.final_amount ?? 0)}</b></div>
          <span className="small bold" style={{ color: "var(--green)" }}>Payment confirmed · {r.payment_method === "cash" ? "Cash" : "UPI"}{r.completed_at ? ` · ${clock(r.completed_at)}` : ""}</span>
          <div className="grid2">
            <button type="button" className="btn btn-lg" onClick={() => window.print()}>Download / Print</button>
            <button type="button" className="btn btn-dark btn-lg" onClick={onClose}>Done</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

export function CancelDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const reasons = ["Fixed it myself", "Got help elsewhere", "Taking too long", "Requested by mistake", "Other"];
  const [pick, setPick] = useState(reasons[0]);
  return (
    <Sheet open={open} onClose={onClose} labelledBy="cancel-h">
      <h2 id="cancel-h" className="h2">Cancel this request?</h2>
      <p className="small muted">The mechanic will be told straight away.</p>
      <div className="stack g8" role="radiogroup" aria-label="Reason">
        {reasons.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={pick === r} className="tile" style={{ minHeight: 48 }} onClick={() => setPick(r)}>{r}</button>
        ))}
      </div>
      <div className="grid2">
        <button type="button" className="btn btn-lg" onClick={onClose}>Keep request</button>
        <button type="button" className="btn btn-dark btn-lg" onClick={() => onConfirm(pick)}>Cancel request</button>
      </div>
    </Sheet>
  );
}
