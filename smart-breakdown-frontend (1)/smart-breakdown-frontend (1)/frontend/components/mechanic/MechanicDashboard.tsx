"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, isDemoMode } from "@/lib/api";
import { useNetwork, useNow, usePolling } from "@/lib/hooks";
import { ACCEPT_WINDOW_S, clock, issueLabel, mmss, priceRange, rupees, vehicleLabel } from "@/lib/labels";
import type { LineItem, MechanicDashboard as Dash, ServiceRequest, Session } from "@/lib/types";
import { Icon } from "../Icon";
import { LiveMap } from "../LiveMap";
import { NetworkBanner, Plate, ProfileMenu, SosLink, Spinner, Switch, TopBar, useToast, VerifiedBadge } from "../ui";

type Badge = { label: string; cls: string };

export default function MechanicDashboard({ session, signOut }: { session: Session; signOut: () => void }) {
  const mid = session.mechanic_id ?? "m1";
  const [dash, setDash] = useState<Dash | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [declineFor, setDeclineFor] = useState<ServiceRequest | null>(null);
  const [billing, setBilling] = useState(false);
  const [seenDone, setSeenDone] = useState<string | null>(null);
  const [lastActiveId, setLastActiveId] = useState<string | null>(null);
  const toast = useToast();
  const net = useNetwork();

  const refresh = useCallback(async () => {
    try {
      const d = await api.mechanicDashboard(mid);
      setDash(d);
      setLoadError(null);
      if (d.active) setLastActiveId(d.active.id);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your dashboard.");
    }
  }, [mid]);

  usePolling(refresh, 2500);

  // Leave the bill form once the job leaves "repairing".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (dash?.active?.status !== "repairing") setBilling(false);
  }, [dash?.active?.status]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.show(ok);
      await refresh();
    } catch (e) {
      toast.show(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  if (!dash) {
    return (
      <div className="page">
        <TopBar subtitle="Mechanic Dashboard · Jaipur" homeHref="/mechanic" />
        <main className="page-main">
          {loadError ? <div className="warn" role="alert"><Icon name="info" />{loadError}</div> : <div className="skeleton" style={{ height: 320, borderRadius: 20 }} />}
        </main>
      </div>
    );
  }

  const { incoming, active } = dash;
  const done = dash.last_completed && dash.last_completed.id === lastActiveId && seenDone !== dash.last_completed.id ? dash.last_completed : null;
  const view = !dash.online ? "offline" : active ? active.status : done ? "done" : incoming ? "incoming" : "waiting";
  const BADGES: Record<string, Badge> = {
    offline: { label: "Offline", cls: "b-grey" },
    waiting: { label: "Online · waiting for requests", cls: "b-green" },
    incoming: { label: "New request", cls: "b-amber" },
    en_route: { label: "On the way", cls: "b-blue" },
    arrived: { label: "Arrived · verify driver", cls: "b-blue" },
    repairing: { label: billing ? "Completing job" : "Repair in progress", cls: billing ? "b-amber" : "b-blue" },
    billing: { label: "Waiting for driver to confirm payment", cls: "b-amber" },
    done: { label: "Job completed", cls: "b-green" },
  };
  const badge = BADGES[view] ?? BADGES.waiting;
  const busyElsewhere = !dash.online || !!active;

  return (
    <div className="page">
      <TopBar subtitle="Mechanic Dashboard · Jaipur" homeHref="/mechanic" compact>
        <button type="button" aria-pressed={dash.online} disabled={!!active || busy}
          onClick={() => act(() => api.setAvailability(mid, !dash.online), dash.online ? "You're offline." : "You're online.")}
          title={active ? "Finish your current job first" : undefined}
          className="row g10 bold"
          style={{ minHeight: 44, padding: "0 14px 0 8px", borderRadius: 999, border: `2px solid ${dash.online ? "var(--green)" : "var(--line-2)"}`, background: dash.online ? "var(--green-tint)" : "#fff", fontSize: 14 }}>
          <span className={`switch${dash.online ? " on" : ""}`} />{dash.online ? "Online" : "Offline"}
        </button>
        <SosLink />
        <ProfileMenu session={session} onLogout={signOut} />
      </TopBar>
      {net.weak && <NetworkBanner text={<><b>Weak network.</b> New requests may arrive late. Keep this page open.</>} />}

      <main className="page-main">
        <div className="row wrap between g12">
          <div className="stack g4" style={{ minWidth: 0 }}>
            <h1 className="h1" style={{ fontSize: 26 }}>{dash.mechanic.name}</h1>
            <span className="row wrap g8 small muted">
              {dash.mechanic.verified && <VerifiedBadge text="Verified partner" />}
              {dash.mechanic.area} · {dash.mechanic.radius_km} km service radius
            </span>
          </div>
          <span role="status" className={`status-pill ${badge.cls}`}><span className="dot" style={{ background: "currentColor" }} />{badge.label}</span>
        </div>

        <div className="cols">
          <div className="col-main">
            {view === "offline" && (
              <section className="card stack center g12" style={{ padding: "32px 24px", alignItems: "center" }}>
                <span style={{ width: 72, height: 72, borderRadius: "50%", background: "#E9ECF0", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="power" size={34} stroke="var(--navy-2)" /></span>
                <h2 className="h2" style={{ fontSize: 24 }}>You&apos;re offline</h2>
                <p className="muted" style={{ maxWidth: 420 }}>Drivers can&apos;t send you requests right now. Go online when you&apos;re ready to take breakdown jobs within {dash.mechanic.radius_km} km.</p>
                <button type="button" className="btn btn-primary btn-lg" style={{ padding: "0 32px" }} disabled={busy} onClick={() => act(() => api.setAvailability(mid, true), "You're online.")}>Go Online</button>
              </section>
            )}
            {view === "waiting" && <WaitingCard radius={dash.mechanic.radius_km} />}
            {view === "incoming" && incoming && (
              <IncomingCard r={incoming} busy={busy}
                onAccept={() => act(() => api.acceptRequest(incoming.id, mid), "Job accepted. Driver notified.").catch(() => {})}
                onDecline={() => setDeclineFor(incoming)} />
            )}
            {active && (
              <ActiveJob r={active} busy={busy} billing={billing} setBilling={setBilling}
                onArrive={() => act(() => api.markArrived(active.id), "Driver notified that you've arrived.").catch(() => {})}
                onVerify={(code) => act(() => api.verifyCode(active.id, code), "Code verified. Start the repair.")}
                onBill={(items, pay) => act(() => api.sendBill(active.id, items, pay), "Bill sent to the driver.")} />
            )}
            {view === "done" && done && (
              <section className="card row wrap g20" style={{ padding: 24, border: "2px solid var(--green)", borderRadius: 22 }}>
                <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="check" size={32} stroke="#fff" width={2.8} /></span>
                <div className="stack g4" style={{ flex: "1 1 280px" }}>
                  <h2 className="h2" style={{ fontSize: 26 }}>Job completed · {rupees(done.final_amount ?? 0)} earned</h2>
                  <span style={{ color: "var(--navy-2)" }}>{done.id} · Payment confirmed by driver · {done.payment_method === "cash" ? "Cash" : "UPI"}{done.completed_at ? ` · ${clock(done.completed_at)}` : ""}</span>
                  <span className="small muted">The driver has been asked to rate the job.</span>
                </div>
                <button type="button" className="btn btn-primary btn-lg" style={{ flex: "1 1 200px" }} onClick={() => setSeenDone(done.id)}>Ready for Next Job</button>
              </section>
            )}

            <section aria-label="Today" className="stats">
              <Stat label="Jobs today" value={String(dash.today.jobs)} />
              <Stat label="Earned today" value={rupees(dash.today.earned)} />
              <Stat label="Rating" value={`${dash.mechanic.rating.toFixed(1)} ★`} />
              <Stat label="Avg. response" value={`${dash.today.avg_response_min} min`} />
            </section>
          </div>

          <aside className="col-side">
            <section aria-labelledby="nb-h" className="card card-pad stack g10">
              <div className="row between" style={{ alignItems: "baseline" }}><h2 id="nb-h" className="h3">Nearby open requests</h2><span className="small muted">within {dash.mechanic.radius_km} km</span></div>
              {busyElsewhere && <p className="note small">{!dash.online ? "Go online to take nearby requests." : "Finish your current job to take another request."}</p>}
              {dash.nearby.map((n) => (
                <div key={n.id} className="list-row" style={{ opacity: busyElsewhere ? 0.55 : 1 }}>
                  <div className="stack grow"><b>{n.issue_label} · {n.vehicle_label}</b><span className="small muted">{n.place} · {n.minutes_ago} min ago</span></div>
                  <b className="small">{n.distance_km} km</b>
                </div>
              ))}
            </section>
            <section aria-labelledby="sv-h" className="card card-pad stack g4">
              <h2 id="sv-h" className="h3">Services &amp; prices</h2>
              <p className="small muted" style={{ marginBottom: 6 }}>Drivers see these ranges. You only get matching requests.</p>
              {dash.services.map((s) => (
                <div key={s.key} className="list-row" style={{ padding: "6px 0" }}>
                  <div className="stack grow"><b style={{ color: s.enabled ? "var(--navy)" : "var(--muted)" }}>{s.label}</b><span className="small muted">{s.price_label}</span></div>
                  <Switch checked={s.enabled} label={s.label} onChange={(v) => act(() => api.setService(mid, s.key, v)).catch(() => {})} />
                </div>
              ))}
            </section>
          </aside>
        </div>

        <div className="cols">
          <WeekCard dash={dash} />
          <section aria-labelledby="rv-h" className="card stack g14" style={{ flex: "2 1 340px", minWidth: 0, padding: 20 }}>
            <div className="row g14">
              <b className="num" style={{ fontSize: 40, lineHeight: 1 }}>{dash.mechanic.rating.toFixed(1)}</b>
              <div className="stack"><h2 id="rv-h" className="h3">Reviews</h2><span className="small muted">{dash.mechanic.reviews} ratings</span></div>
            </div>
            {dash.reviews.map((r) => (
              <div key={r.id} className="stack g6" style={{ paddingTop: 12, borderTop: "1px solid var(--line-3)" }}>
                <div className="row between small"><b><span aria-label={`${r.stars} out of 5 stars`}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span> · {r.service}</b><span className="muted">{r.when}</span></div>
                <span>&ldquo;{r.text}&rdquo;</span>
                <span className="row wrap g6">{r.tags.map((t) => <span key={t} className="tiny" style={{ background: "var(--bg)", padding: "3px 8px", borderRadius: 6 }}>{t}</span>)}</span>
              </div>
            ))}
          </section>
        </div>
      </main>

      <DeclineDialog r={declineFor} busy={busy} onClose={() => setDeclineFor(null)}
        onConfirm={(reason) => declineFor && act(() => api.declineRequest(declineFor.id, mid, reason), "Request passed to the next nearest mechanic.").then(() => setDeclineFor(null)).catch(() => {})} />
      {toast.node}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat"><span className="small muted">{label}</span><b className="num" style={{ fontSize: 24 }}>{value}</b></div>;
}

function WaitingCard({ radius }: { radius: number }) {
  return (
    <section className="card row wrap g24" style={{ padding: "28px 24px" }}>
      <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true" style={{ flex: "none", margin: "0 auto" }}>
        <circle cx="75" cy="75" r="70" fill="#F6F7F9" /><circle cx="75" cy="75" r="50" fill="none" stroke="#E3E6EB" strokeWidth="2" />
        <circle cx="75" cy="75" r="28" fill="none" stroke="#E3E6EB" strokeWidth="2" />
        <path d="M75 75 L 75 5 A 70 70 0 0 1 135 40 Z" fill="#157F3C" fillOpacity=".12" className="spin" style={{ transformOrigin: "75px 75px", animationDuration: "4s" }} />
        <circle cx="75" cy="75" r="12" fill="#0E1A2B" stroke="#fff" strokeWidth="3" /><circle cx="75" cy="75" r="4" fill="#F5A524" />
      </svg>
      <div className="stack g10" style={{ flex: "1 1 280px" }}>
        <h2 className="h2" style={{ fontSize: 24 }}>Waiting for requests</h2>
        <p className="muted">You&apos;re online. New breakdowns within {radius} km that match your services will appear here.</p>
        <ul style={{ listStyle: "none", padding: 0 }} className="stack g6 small">
          <li className="row g8"><Icon name="check" size={16} stroke="var(--green)" width={2.8} />Keep this page open and your phone charged</li>
          <li className="row g8"><Icon name="check" size={16} stroke="var(--green)" width={2.8} />Respond within {ACCEPT_WINDOW_S} seconds to keep a high response score</li>
        </ul>
        {isDemoMode && <p className="tiny muted">Demo: a sample request arrives in a few seconds.</p>}
      </div>
    </section>
  );
}

function IncomingCard({ r, busy, onAccept, onDecline }: { r: ServiceRequest; busy: boolean; onAccept: () => void; onDecline: () => void }) {
  const now = useNow(1000);
  const left = r.accept_deadline ? Math.max(0, (r.accept_deadline - now) / 1000) : ACCEPT_WINDOW_S;
  const circ = 2 * Math.PI * 27;
  return (
    <section aria-labelledby="nr-h" className="stack" style={{ background: "#fff", border: "3px solid var(--amber)", borderRadius: 22, overflow: "hidden" }}>
      <div className="row wrap g16" style={{ background: "var(--navy)", color: "#fff", padding: "16px 20px" }}>
        <div className="stack g4" style={{ flex: "1 1 240px" }}>
          <span className="kicker" style={{ color: "#FFD27A" }}>New breakdown request</span>
          <h2 id="nr-h" className="display" style={{ fontSize: 30, lineHeight: 1.1 }}>{issueLabel(r.issue)} · {vehicleLabel(r.vehicle)}</h2>
        </div>
        <div className="row g10" role="timer" aria-label={`${Math.ceil(left)} seconds left to respond`}>
          <div style={{ position: "relative", width: 64, height: 64 }}>
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="6" />
              <circle cx="32" cy="32" r="27" fill="none" stroke="var(--amber)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(circ * left) / ACCEPT_WINDOW_S} ${circ}`} transform="rotate(-90 32 32)" />
            </svg>
            <b className="num" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{mmss(left)}</b>
          </div>
          <span className="small" style={{ color: "#C9D1DC", lineHeight: 1.3 }}>left to<br />respond</span>
        </div>
      </div>
      <div className="row wrap g20" style={{ padding: 20, alignItems: "flex-start" }}>
        <div className="stack g14" style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div className="grid2" style={{ gap: 10 }}>
            <div className="soft stack" style={{ padding: "12px 14px" }}><span className="kicker muted">Distance</span><b className="num" style={{ fontSize: 22 }}>{r.distance_km} km</b><span className="small muted">~{r.eta_min} min drive</span></div>
            <div className="soft stack" style={{ padding: "12px 14px" }}><span className="kicker muted">Est. amount</span><b className="num" style={{ fontSize: 22 }}>{priceRange(r.price_min, r.price_max)}</b><span className="small muted">Your price range</span></div>
          </div>
          <dl className="kv" style={{ ["--kv-label" as string]: "100px" }}>
            <dt className="muted">Driver</dt><dd>{r.driver_name}</dd>
            <dt className="muted">Vehicle</dt><dd>{r.driver_vehicle_model}</dd>
            <dt className="muted">Location</dt><dd>{r.location.label}</dd>
            {r.description && <><dt className="muted">Driver says</dt><dd style={{ fontWeight: 400 }}>&ldquo;{r.description}&rdquo;</dd></>}
          </dl>
          <div className="ai-card stack g8" style={{ padding: 14, borderRadius: 14 }}>
            <div className="row wrap g8"><Icon name="spark" size={18} stroke="var(--blue)" width={2.2} /><span className="kicker" style={{ color: "var(--blue-ink)" }}>AI diagnosis</span>
              <span className="badge" style={{ background: "#fff", color: "var(--blue-ink)" }}>{r.diagnosis.confidence} confidence</span></div>
            <b style={{ fontSize: 16 }}>{r.diagnosis.title}</b>
            <span className="small"><b>Tip:</b> {r.diagnosis.mechanic_tip}</span>
          </div>
        </div>
        <div className="stack g8" style={{ flex: "1 1 260px", minWidth: 0 }}>
          <LiveMap height={250} radius={14} ariaLabel="Driver location" interactive={false}
            markers={[{ id: "drv", kind: "you", lat: r.location.lat, lng: r.location.lng, title: "Driver" }, ...(r.mechanic_location ? [{ id: "me", kind: "mech" as const, lat: r.mechanic_location.lat, lng: r.mechanic_location.lng, title: "You" }] : [])]}
            route={r.mechanic_location ? [[r.mechanic_location.lat, r.mechanic_location.lng], [r.location.lat, r.location.lng]] : undefined} />
          <span className="row g6 small muted"><Icon name="lock" size={14} />Phone number and number plate unlock after you accept</span>
        </div>
      </div>
      <div style={{ padding: "0 20px 20px", display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <button type="button" className="btn btn-lg" disabled={busy} onClick={onDecline}>Decline</button>
        <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={onAccept}>{busy ? <Spinner /> : "Accept Job"}</button>
      </div>
    </section>
  );
}

const STEPS = ["Accepted", "On the way", "Arrived", "Repairing", "Completed"];

function ActiveJob({ r, busy, billing, setBilling, onArrive, onVerify, onBill }: {
  r: ServiceRequest; busy: boolean; billing: boolean; setBilling: (v: boolean) => void;
  onArrive: () => void; onVerify: (code: string) => Promise<unknown>; onBill: (items: LineItem[], pay: "upi" | "cash") => Promise<unknown>;
}) {
  const idx = r.status === "en_route" ? 1 : r.status === "arrived" ? 2 : r.status === "repairing" ? (billing ? 4 : 3) : 4;
  return (
    <section aria-labelledby="aj-h" className="card" style={{ borderRadius: 22, overflow: "hidden" }}>
      <div className="row wrap between g12" style={{ padding: "18px 20px", borderBottom: "1px solid var(--line-3)" }}>
        <div className="stack g4">
          <span className="kicker muted">Active job · {r.id}</span>
          <h2 id="aj-h" className="h2" style={{ fontSize: 24 }}>{issueLabel(r.issue)} · {r.driver_vehicle_model.split(" · ")[0]}</h2>
        </div>
        <div className="row g8">
          <Plate>{r.driver_plate}</Plate>
          <a className="btn btn-sm" href="tel:+910000000000" style={{ minHeight: 44 }}><Icon name="phone" size={16} />Call driver</a>
        </div>
      </div>
      <ol aria-label="Job progress" className="job-steps">
        {STEPS.map((s, i) => (
          <li key={s} className="stack g6" aria-current={i === idx ? "step" : undefined}>
            <span style={{ height: 6, borderRadius: 3, background: i < idx ? "var(--green)" : i === idx ? "var(--amber)" : "var(--line)" }} />
            <span className="small job-step-label" style={{ fontWeight: i === idx ? 700 : 600, color: i <= idx ? "var(--navy)" : "var(--muted)" }}>{s}</span>
          </li>
        ))}
      </ol>
      {r.status === "en_route" && <OnTheWay r={r} busy={busy} onArrive={onArrive} />}
      {r.status === "arrived" && <VerifyCode r={r} busy={busy} onVerify={onVerify} />}
      {r.status === "repairing" && !billing && <Repairing r={r} onComplete={() => setBilling(true)} />}
      {r.status === "repairing" && billing && <BillForm r={r} busy={busy} onBack={() => setBilling(false)} onSend={onBill} />}
      {r.status === "billing" && (
        <div className="row wrap g16" style={{ padding: 20 }}>
          <Spinner size={28} color="var(--amber)" />
          <div className="stack g4 grow">
            <b style={{ fontSize: 17 }}>Bill sent · {rupees(r.final_amount ?? 0)}</b>
            <span className="muted">Waiting for {r.driver_name} to confirm the {r.payment_method === "cash" ? "cash" : "UPI"} payment in their app.</span>
          </div>
        </div>
      )}
    </section>
  );
}

function OnTheWay({ r, busy, onArrive }: { r: ServiceRequest; busy: boolean; onArrive: () => void }) {
  const ml = r.mechanic_location;
  return (
    <>
      <div className="row wrap g20" style={{ padding: 20, alignItems: "stretch" }}>
        <div style={{ flex: "3 1 340px", minWidth: 0 }}>
          <LiveMap height={300} radius={16} ariaLabel="Route to the driver"
            markers={[{ id: "drv", kind: "you", lat: r.location.lat, lng: r.location.lng, title: "Driver" }, ...(ml ? [{ id: "me", kind: "mech" as const, lat: ml.lat, lng: ml.lng, title: "You" }] : [])]}
            route={ml ? [[ml.lat, ml.lng], [r.location.lat, r.location.lng]] : undefined} />
        </div>
        <div className="stack g12" style={{ flex: "2 1 240px" }}>
          <div className="stack g4"><span className="small muted">Driver is waiting</span><b className="num" style={{ fontSize: 40, lineHeight: 1 }}>{r.eta_min ?? "–"} min</b><span style={{ color: "var(--navy-2)" }}>{r.location.label}</span></div>
          <p className="note">The driver sees your live location. Look for a <b>{r.driver_vehicle_model}</b> with hazard lights on.</p>
          <a className="btn btn-dark" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${r.location.lat},${r.location.lng}`}><Icon name="nav" size={18} />Open navigation</a>
        </div>
      </div>
      <div style={{ padding: "0 20px 20px" }}>
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={onArrive}>{busy ? <Spinner /> : "I've Arrived"}</button>
      </div>
    </>
  );
}

function VerifyCode({ r, busy, onVerify }: { r: ServiceRequest; busy: boolean; onVerify: (c: string) => Promise<unknown> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try { await onVerify(code); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't verify."); }
  };
  return (
    <form className="row wrap g24" style={{ padding: "24px 20px", alignItems: "flex-start" }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="stack g10" style={{ flex: "1 1 300px" }}>
        <h3 className="h2">Verify you&apos;re at the right vehicle</h3>
        <p className="muted">Ask {r.driver_name} for the 4-digit code shown in their app and enter it here. This confirms your arrival and protects you both.</p>
        {isDemoMode && <p className="note small">Demo: the driver&apos;s code is <b>{r.verification_code}</b>.</p>}
      </div>
      <div className="stack g10" style={{ flex: "1 1 300px" }}>
        <label htmlFor="drv-code" className="label">Driver&apos;s code</label>
        <input id="drv-code" className="input num" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          style={{ height: 68, fontSize: 32, letterSpacing: "0.6em", textAlign: "center", border: "2px solid var(--navy)" }} aria-describedby="code-help" />
        <span id="code-help" className="small muted">Wrong code 3 times alerts the control room.</span>
        {error && <span className="error-text" role="alert"><Icon name="info" size={18} />{error}</span>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || code.length !== 4}>{busy ? <Spinner /> : "Verify Code & Start Repair"}</button>
      </div>
    </form>
  );
}

function Repairing({ r, onComplete }: { r: ServiceRequest; onComplete: () => void }) {
  const [checks, setChecks] = useState([true, false, false]);
  const items = ["Warning triangle placed behind the vehicle", `Problem confirmed: ${r.diagnosis.title.toLowerCase()}`, "Work checked with the driver"];
  return (
    <div className="stack g16" style={{ padding: 20 }}>
      <div className="row wrap g20" style={{ alignItems: "flex-start" }}>
        <div className="stack g4" style={{ flex: "1 1 220px" }}>
          <span className="small muted">Code verified · repair started</span>
          <b style={{ fontSize: 18 }}>{r.diagnosis.service}</b>
          <span className="small muted">Quoted {priceRange(r.price_min, r.price_max)} · extra work needs the driver&apos;s OK</span>
        </div>
        <fieldset className="stack g6" style={{ flex: "2 1 320px", border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Checklist</legend>
          {items.map((t, i) => (
            <label key={t} className="row g10" style={{ minHeight: 40 }}>
              <input type="checkbox" checked={checks[i]} onChange={() => setChecks((c) => c.map((v, j) => (j === i ? !v : v)))} style={{ width: 20, height: 20, accentColor: "var(--green)" }} />{t}
            </label>
          ))}
        </fieldset>
      </div>
      <button type="button" className="btn btn-primary btn-lg" onClick={onComplete}>Complete Job</button>
    </div>
  );
}

function BillForm({ r, busy, onBack, onSend }: { r: ServiceRequest; busy: boolean; onBack: () => void; onSend: (items: LineItem[], pay: "upi" | "cash") => Promise<unknown> }) {
  const [items, setItems] = useState<LineItem[]>([
    { label: r.diagnosis.service, amount: r.price_min ?? 300 },
    { label: "Roadside call-out", amount: 150 },
  ]);
  const [pay, setPay] = useState<"upi" | "cash">("upi");
  const total = items.reduce((a, b) => a + (Number.isFinite(b.amount) ? b.amount : 0), 0);
  const within = r.price_max == null || total <= r.price_max;
  const update = (i: number, patch: Partial<LineItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const valid = items.length > 0 && items.every((x) => x.label.trim() && x.amount >= 0) && total > 0;
  return (
    <form className="row wrap g24" style={{ padding: 20, alignItems: "flex-start" }} onSubmit={(e) => { e.preventDefault(); onSend(items, pay).catch(() => {}); }}>
      <div className="stack g12" style={{ flex: "3 1 340px", minWidth: 0 }}>
        <h3 className="h2">Complete job · final amount</h3>
        <div className="stack" style={{ border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
          {items.map((it, i) => (
            <div key={i} className="bill-item">
              <label className="sr-only" htmlFor={`item-${i}`}>Item {i + 1}</label>
              <input id={`item-${i}`} className="input grow" style={{ height: 44 }} value={it.label} onChange={(e) => update(i, { label: e.target.value })} />
              <label className="sr-only" htmlFor={`amt-${i}`}>Amount for item {i + 1}</label>
              <span className="bill-amount">₹<input id={`amt-${i}`} className="input" style={{ height: 44, marginLeft: 4 }} inputMode="numeric" value={String(it.amount)} onChange={(e) => update(i, { amount: Number(e.target.value.replace(/\D/g, "") || 0) })} /></span>
              <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${it.label}`} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
            </div>
          ))}
          <button type="button" className="link-btn" style={{ padding: "0 14px", minHeight: 48 }} onClick={() => setItems((xs) => [...xs, { label: "", amount: 0 }])}><Icon name="plus" size={16} />Add item</button>
        </div>
        <div role="radiogroup" aria-label="Payment method" className="row wrap g8">
          <span className="label" style={{ width: "100%" }}>Payment method</span>
          {(["upi", "cash"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={pay === m} className="pill" style={{ borderRadius: 12, ...(pay === m ? { borderColor: "var(--amber)", background: "var(--amber-tint)" } : {}) }} onClick={() => setPay(m)}>{m === "upi" ? "UPI" : "Cash"}</button>
          ))}
        </div>
      </div>
      <div className="stack g8 soft" style={{ flex: "2 1 240px", padding: 18, borderRadius: 16 }}>
        <span className="small muted">Total to collect</span>
        <b className="num" style={{ fontSize: 40, lineHeight: 1 }}>{rupees(total)}</b>
        <span className={`badge ${within ? "b-green" : "b-amber"}`} style={{ alignSelf: "flex-start" }}>{within ? "Within" : "Above"} quoted {priceRange(r.price_min, r.price_max)}</span>
        {!within && <span className="small" style={{ color: "var(--warn-ink)" }}>Explain the extra work to the driver before sending.</span>}
        <span className="small muted">The driver confirms this amount and payment in their app before the job closes.</span>
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !valid}>{busy ? <Spinner /> : "Send Bill to Driver"}</button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>Back to repair</button>
      </div>
    </form>
  );
}

function WeekCard({ dash }: { dash: Dash }) {
  const max = Math.max(...dash.week.map((d) => d.amount), 1);
  const w = dash.week_summary;
  return (
    <section aria-labelledby="wk-h" className="card stack g16" style={{ flex: "3 1 520px", minWidth: 0, padding: 20 }}>
      <h2 id="wk-h" className="h3">This week</h2>
      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
        <div className="stack"><span className="small muted">Earnings</span><b className="num" style={{ fontSize: 22 }}>{rupees(w.earned)}</b></div>
        <div className="stack"><span className="small muted">Jobs done</span><b className="num" style={{ fontSize: 22 }}>{w.jobs}</b></div>
        <div className="stack"><span className="small muted">Accepted</span><b className="num" style={{ fontSize: 22 }}>{w.accepted} of {w.offered}</b></div>
        <div className="stack"><span className="small muted">On-time arrivals</span><b className="num" style={{ fontSize: 22 }}>{w.on_time} of {w.jobs}</b></div>
      </div>
      <div role="img" aria-label={`Daily earnings this week: ${dash.week.map((d) => `${d.day} ${rupees(d.amount)}`).join(", ")}`}
        style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 10, alignItems: "end", height: 160 }}>
        {dash.week.map((d, i) => {
          const today = i === dash.week.length - 1;
          return (
            <div key={d.day} className="stack" style={{ alignItems: "center", justifyContent: "flex-end", gap: 6, height: "100%" }}>
              <span className="tiny bold" style={{ color: "var(--navy-2)" }}>₹{d.amount >= 1000 ? (d.amount / 1000).toFixed(1) + "k" : d.amount}</span>
              <span style={{ width: "100%", maxWidth: 44, height: `${Math.round((d.amount / max) * 100)}%`, minHeight: 4, background: today ? "var(--amber)" : "var(--navy)", borderRadius: "6px 6px 2px 2px" }} />
              <span className="tiny" style={{ fontWeight: today ? 700 : 500, color: today ? "var(--navy)" : "var(--muted)" }}>{d.day}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DeclineDialog({ r, busy, onClose, onConfirm }: { r: ServiceRequest | null; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const reasons = ["Too far from me", "Busy with another job", "Don't have the right parts", "I don't service this vehicle", "Other reason"];
  const [pick, setPick] = useState(reasons[1]);
  if (!r) return null;
  return (
    <div className="backdrop centered" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="dc-h" className="dialog">
        <h2 id="dc-h" className="h2">Why are you declining?</h2>
        <p className="small muted">The request goes straight to the next best mechanic. Your reason helps us send better matches.</p>
        <div className="stack g8" role="radiogroup" aria-label="Reason">
          {reasons.map((x) => <button key={x} type="button" role="radio" aria-checked={pick === x} className="tile" style={{ minHeight: 48 }} onClick={() => setPick(x)}>{x}</button>)}
        </div>
        <div className="grid2" style={{ gap: 10 }}>
          <button type="button" className="btn btn-lg" onClick={onClose}>Go back</button>
          <button type="button" className="btn btn-dark btn-lg" disabled={busy} onClick={() => onConfirm(pick)}>Decline request</button>
        </div>
      </div>
    </div>
  );
}
