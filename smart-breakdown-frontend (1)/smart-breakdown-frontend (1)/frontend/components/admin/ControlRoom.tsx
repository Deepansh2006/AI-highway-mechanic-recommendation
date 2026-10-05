"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { usePolling } from "@/lib/hooks";
import { clock } from "@/lib/labels";
import type { AdminOverview, Incident, IncidentStatus, Session, Verification } from "@/lib/types";
import { Icon } from "../Icon";
import { LiveMap, type MapMarker } from "../LiveMap";
import { Avatar, ProfileMenu, Spinner, TopBar, useToast } from "../ui";

const STATUS: Record<IncidentStatus, { label: string; cls: string; color: string }> = {
  open: { label: "Open", cls: "b-amber", color: "#E8590C" },
  en_route: { label: "En route", cls: "b-blue", color: "#1F5FD6" },
  fixing: { label: "Fixing", cls: "b-green", color: "#157F3C" },
  resolved: { label: "Resolved", cls: "b-grey", color: "#6B7280" },
};

const C: [number, number] = [26.9124, 75.7873];
const HIGHWAYS = [
  { id: "nh48d", label: "NH-48 · Delhi Road", positions: [C, [27.02, 75.86], [27.1333, 75.8893], [27.25, 75.95]] as [number, number][] },
  { id: "nh48a", label: "NH-48 · Ajmer Road", positions: [C, [26.8936, 75.7398], [26.8641, 75.6458], [26.8385, 75.5652], [26.8152, 75.5398], [26.78, 75.45]] as [number, number][] },
  { id: "nh21", label: "NH-21 · Agra Road", positions: [C, [26.87, 75.88], [26.8216, 75.9829], [26.8, 76.08]] as [number, number][] },
  { id: "nh52s", label: "NH-52 · Sikar Road", positions: [C, [27.03, 75.76], [27.1667, 75.7246], [27.27, 75.7]] as [number, number][] },
  { id: "nh52t", label: "NH-52 · Tonk Road", positions: [C, [26.8242, 75.8122], [26.7231, 75.8463], [26.62, 75.87]] as [number, number][] },
];
const BOUNDS = [{ lat: 27.2, lng: 75.5 }, { lat: 26.68, lng: 76.02 }];

type Tab = "incidents" | "sos" | "verify";
type Layer = "breakdowns" | "mechanics" | "hotspots" | "highways";

export default function ControlRoom({ session, signOut }: { session: Session; signOut: () => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("incidents");
  const [filter, setFilter] = useState<"all" | IncidentStatus>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ breakdowns: true, mechanics: true, hotspots: false, highways: true });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = async () => {
    try {
      setData(await api.adminOverview());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load live data.");
    }
  };
  usePolling(load, 5000);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.show(ok);
      await load();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const incidents = useMemo(() => (data?.incidents ?? []).filter((i) => filter === "all" || i.status === filter), [data, filter]);
  const sel = data?.incidents.find((i) => i.id === selected) ?? null;
  const activeSos = data?.sos.filter((s) => s.status === "active") ?? [];

  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    const m: MapMarker[] = [];
    if (layers.mechanics) data.mechanics.forEach((x) => m.push({ id: `m-${x.id}`, kind: "small", lat: x.lat, lng: x.lng, title: x.name }));
    if (layers.breakdowns) data.incidents.forEach((i) => m.push({
      id: i.id, kind: "incident", lat: i.lat, lng: i.lng, color: i.sos ? "#C8102E" : STATUS[i.status].color,
      title: `${i.id} · ${i.issue_label} · ${STATUS[i.status].label}`, selected: i.id === selected,
      onClick: () => { setSelected(i.id); setTab("incidents"); },
    }));
    return m;
  }, [data, layers, selected]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.incidents.length ?? 0 };
    data?.incidents.forEach((i) => (c[i.status] = (c[i.status] ?? 0) + 1));
    return c;
  }, [data]);

  return (
    <div className="page" style={{ ["--page-max" as string]: "1400px" }}>
      <TopBar subtitle="Control Room · Jaipur" homeHref="/admin" compact>
        <ProfileMenu session={session} onLogout={signOut} />
      </TopBar>

      {activeSos.map((s) => (
        <div key={s.id} role="alert" style={{ background: "var(--red)", color: "#fff" }}>
          <div className="container row wrap g12" style={{ paddingTop: 12, paddingBottom: 12 }}>
            <Icon name="alert" stroke="#fff" width={2.4} />
            <span className="grow"><b>SOS {s.id}</b> · {s.place} · sent {clock(s.sent_at)} · notified: {s.notified.join(", ")}</span>
            <button type="button" className="btn btn-sm" style={{ background: "#fff", borderColor: "#fff", color: "var(--red-ink)", fontWeight: 700 }} disabled={busy}
              onClick={() => act(() => api.acknowledgeSos(s.id), `${s.id} acknowledged. Team notified.`)}>Acknowledge</button>
            <button type="button" className="btn btn-sm" style={{ background: "transparent", borderColor: "rgba(255,255,255,.6)", color: "#fff" }} onClick={() => setTab("sos")}>View</button>
          </div>
        </div>
      ))}

      <main className="page-main">
        <div className="row wrap between g12" style={{ alignItems: "flex-end" }}>
          <div className="stack g4">
            <h1 className="h1" style={{ fontSize: 28 }}>Live operations · Jaipur region</h1>
            <span className="row g8 small muted"><span className="dot" style={{ background: error ? "#E39A0E" : "var(--green)" }} />{error ? `Reconnecting… ${error}` : "Live · updates every 5 seconds"}</span>
          </div>
        </div>

        <section aria-label="Key numbers" className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <Kpi label="Open requests" value={data?.kpis.open_requests} />
          <Kpi label="Mechanics online" value={data?.kpis.mechanics_online} />
          <Kpi label="Avg. arrival time" value={data ? `${data.kpis.avg_arrival_min} min` : undefined} />
          <Kpi label="Active SOS alerts" value={data?.kpis.active_sos} danger={!!data?.kpis.active_sos} />
        </section>

        <div className="cols" style={{ alignItems: "stretch" }}>
          <section aria-labelledby="map-h" className="card stack g12" style={{ flex: "999 1 560px", minWidth: 0, padding: 12 }}>
            <div className="row wrap between g8" style={{ padding: "4px 6px 0" }}>
              <h2 id="map-h" className="h3">Live map — Jaipur</h2>
              <div role="group" aria-label="Map layers" className="row wrap g6">
                {([["breakdowns", "Breakdowns"], ["mechanics", "Mechanics online"], ["hotspots", "Hotspots"], ["highways", "Highways"]] as [Layer, string][]).map(([k, l]) => (
                  <button key={k} type="button" className="pill" style={{ minHeight: 36, padding: "0 12px", fontSize: 13 }} aria-pressed={layers[k]} onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}>{l}</button>
                ))}
              </div>
            </div>
            <LiveMap height="clamp(320px, 60vh, 540px)" radius={12} ariaLabel="Map of Jaipur highways with breakdowns and mechanics" markers={markers} fitTo={BOUNDS} padding={10}
              lines={layers.highways ? HIGHWAYS.map((h) => ({ ...h, color: "#F2C14E", weight: 7 })) : undefined}
              circles={layers.hotspots && data ? data.hotspots.map((h, i) => ({ id: `h${i}`, lat: h.lat, lng: h.lng, radius: 2500 * h.weight + 800, color: "#E8590C", label: `Hotspot · ${h.label}` })) : undefined} />
            <div className="row wrap g16 small" style={{ padding: "0 6px 4px", color: "var(--navy-2)" }}>
              <Legend color="#E8590C" label="Open" /><Legend color="#1F5FD6" label="Mechanic en route" /><Legend color="#157F3C" label="Being fixed" />
              <Legend color="#C8102E" label="SOS" /><Legend color="#0E1A2B" label="Mechanic online" small />
            </div>
          </section>

          <section aria-label="Work queue" className="card stack" style={{ flex: "1 1 380px", minWidth: 0, overflow: "hidden" }}>
            <div role="tablist" aria-label="Queue" className="seg" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", margin: 12 }}>
              <button type="button" role="tab" aria-selected={tab === "incidents"} onClick={() => setTab("incidents")}>Incidents · {data?.incidents.length ?? "–"}</button>
              <button type="button" role="tab" aria-selected={tab === "sos"} onClick={() => setTab("sos")} style={activeSos.length ? { color: "var(--red-ink)" } : undefined}>SOS · {activeSos.length}</button>
              <button type="button" role="tab" aria-selected={tab === "verify"} onClick={() => setTab("verify")}>Verify · {data?.verifications.filter((v) => v.status !== "approved").length ?? "–"}</button>
            </div>

            <div className="stack g8" style={{ padding: "0 12px 12px", overflowY: "auto", maxHeight: 620 }}>
              {!data && <div className="skeleton" style={{ height: 300 }} />}

              {data && tab === "incidents" && !sel && (
                <>
                  <div className="row wrap g6" role="group" aria-label="Filter by status">
                    {(["all", "open", "en_route", "fixing"] as const).map((f) => (
                      <button key={f} type="button" className="pill" style={{ minHeight: 36, fontSize: 13, padding: "0 12px" }} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                        {f === "all" ? "All" : STATUS[f].label} · {counts[f] ?? 0}
                      </button>
                    ))}
                  </div>
                  {incidents.length === 0 && <p className="muted small" style={{ padding: 8 }}>No incidents with this status.</p>}
                  {[...incidents].sort((a, b) => Number(b.sos) - Number(a.sos) || (a.status === "open" ? -1 : 1)).map((i) => <IncidentRow key={i.id} i={i} onClick={() => setSelected(i.id)} />)}
                </>
              )}
              {data && tab === "incidents" && sel && (
                <IncidentDetail i={sel} busy={busy} onBack={() => setSelected(null)}
                  onAssign={() => act(() => api.assignIncident(sel.id), `Nearest verified mechanic assigned to ${sel.id}.`)} />
              )}

              {data && tab === "sos" && (
                data.sos.length === 0 ? <p className="muted small" style={{ padding: 8 }}>No SOS alerts right now.</p> :
                data.sos.map((s) => (
                  <div key={s.id} className="stack g8" style={{ border: `2px solid ${s.status === "active" ? "var(--red)" : "var(--line)"}`, borderRadius: 14, padding: 14 }}>
                    <div className="row between"><b>{s.id}</b><span className={`badge ${s.status === "active" ? "b-red" : "b-grey"}`}>{s.status === "active" ? "Active" : "Acknowledged"}</span></div>
                    <span className="small">{s.place}</span>
                    <span className="small muted">Sent {clock(s.sent_at)} · Notified: {s.notified.join(", ")}</span>
                    <div className="grid2">
                      <a className="btn btn-sm" href="tel:112">Call 112</a>
                      <button type="button" className="btn btn-dark btn-sm" disabled={busy || s.status !== "active"} onClick={() => act(() => api.acknowledgeSos(s.id), `${s.id} acknowledged.`)}>{s.status === "active" ? "Acknowledge" : "Acknowledged"}</button>
                    </div>
                  </div>
                ))
              )}

              {data && tab === "verify" && (
                <>
                  <p className="small muted">New workshops can&apos;t receive requests until approved.</p>
                  {data.verifications.map((v) => (
                    <VerificationItem key={v.id} v={v} open={reviewing === v.id} busy={busy} onToggle={() => setReviewing(reviewing === v.id ? null : v.id)}
                      onApprove={() => act(() => api.approveVerification(v.id), `${v.workshop} approved and now visible to drivers.`)}
                      onRequest={(doc) => act(() => api.requestDocument(v.id, doc), `Asked ${v.workshop} for: ${doc}.`)} />
                  ))}
                </>
              )}
            </div>
          </section>
        </div>
      </main>
      {busy && <div className="sr-only" role="status">Working…</div>}
      {toast.node}
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number | string | undefined; danger?: boolean }) {
  return (
    <div className="stat" style={danger ? { background: "var(--red-tint)", borderColor: "var(--red-line)" } : undefined}>
      <span className="small" style={{ fontWeight: 700, color: danger ? "var(--red-ink)" : "var(--muted)" }}>{label}</span>
      <b className="num" style={{ fontSize: 30, color: danger ? "var(--red-ink)" : undefined }}>{value ?? "–"}</b>
    </div>
  );
}

function Legend({ color, label, small }: { color: string; label: string; small?: boolean }) {
  return <span className="row g6"><span className="dot" style={{ background: color, width: small ? 9 : 12, height: small ? 9 : 12 }} />{label}</span>;
}

function IncidentRow({ i, onClick }: { i: Incident; onClick: () => void }) {
  const s = STATUS[i.status];
  return (
    <button type="button" onClick={onClick} className="stack g4"
      style={{ textAlign: "left", borderRadius: 12, border: `2px solid ${i.sos ? "var(--red)" : "var(--line)"}`, background: "#fff", padding: 12 }}>
      <span className="row between g8" style={{ width: "100%" }}>
        <b>{i.id} · {i.issue_label}</b>
        <span className="row g4">{i.sos && <span className="badge b-red">SOS</span>}<span className={`badge ${s.cls}`}>{s.label}</span></span>
      </span>
      <span className="small muted">{i.highway} · {i.place} · waiting {i.minutes_waiting} min</span>
      <span className="small" style={{ color: "var(--navy-2)" }}>{i.mechanic_name ? `${i.mechanic_name}${i.eta_min ? ` · ETA ${i.eta_min} min` : ""}` : "No mechanic assigned"}</span>
    </button>
  );
}

function IncidentDetail({ i, busy, onBack, onAssign }: { i: Incident; busy: boolean; onBack: () => void; onAssign: () => void }) {
  const s = STATUS[i.status];
  return (
    <div className="stack g12">
      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", marginLeft: -8 }} onClick={onBack}><Icon name="back" size={18} />All incidents</button>
      <div className="row between g8"><h3 className="h2" style={{ fontSize: 20 }}>{i.id}</h3><span className="row g4">{i.sos && <span className="badge b-red">SOS</span>}<span className={`badge ${s.cls}`}>{s.label}</span></span></div>
      <dl className="kv" style={{ ["--kv-label" as string]: "110px", fontSize: 14 }}>
        <dt className="muted">Problem</dt><dd>{i.issue_label} · {i.vehicle_label}</dd>
        <dt className="muted">Location</dt><dd>{i.place}, {i.highway}</dd>
        <dt className="muted">Waiting</dt><dd>{i.minutes_waiting} min</dd>
        <dt className="muted">Mechanic</dt><dd>{i.mechanic_name ?? "Not yet assigned"}</dd>
        <dt className="muted">ETA</dt><dd>{i.eta_min ? `${i.eta_min} min` : "—"}</dd>
      </dl>
      {i.sos && <p className="note" style={{ background: "var(--red-tint)", color: "var(--red-ink)" }}>SOS raised for this incident. Confirm emergency services are informed.</p>}
      <div className="grid2" style={{ gap: 10 }}>
        {i.status === "open"
          ? <button type="button" className="btn btn-primary" disabled={busy} onClick={onAssign}>{busy ? <Spinner /> : "Assign nearest mechanic"}</button>
          : <button type="button" className="btn btn-dark" disabled>Tracking mechanic</button>}
        <a className="btn" href="tel:+910000000000"><Icon name="phone" size={16} />Call driver</a>
      </div>
      {i.sos && <a className="sos" href="tel:112" style={{ justifyContent: "center" }}>Call 112 for this incident</a>}
    </div>
  );
}

function VerificationItem({ v, open, busy, onToggle, onApprove, onRequest }: {
  v: Verification; open: boolean; busy: boolean; onToggle: () => void; onApprove: () => void; onRequest: (doc: string) => void;
}) {
  const submitted = v.documents.filter((d) => d.submitted).length;
  const missing = v.documents.filter((d) => !d.submitted);
  const status = v.status === "approved" ? { l: "Approved", c: "b-green" } : v.status === "missing_docs" ? { l: "Missing documents", c: "b-amber" } : { l: "Ready for review", c: "b-blue" };
  return (
    <div className="stack g8" style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12 }}>
      <div className="row g10">
        <Avatar initials={v.workshop.split(" ").map((w) => w[0]).slice(0, 2).join("")} size={40} tint="#E9ECF0" label={v.workshop} />
        <div className="stack grow"><b>{v.workshop}</b><span className="small muted">{v.area} · {v.services}</span></div>
        <span className={`badge ${status.c}`}>{status.l}</span>
      </div>
      <div className="row between small"><span className="muted">Documents {submitted} of {v.documents.length} · submitted {v.submitted}</span>
        <button type="button" className="link-btn" aria-expanded={open} onClick={onToggle}>{open ? "Close" : "Review"}</button></div>
      {open && (
        <div className="stack g8 soft" style={{ padding: 12 }}>
          {v.documents.map((d) => (
            <div key={d.name} className="row g8 small">
              <Icon name={d.submitted ? "check" : "x"} size={16} stroke={d.submitted ? "var(--green)" : "var(--warn-ink)"} width={2.6} />
              <span className="grow">{d.name}</span>
              {d.submitted ? <span className="muted">Uploaded</span> : <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onRequest(d.name)}>Request</button>}
            </div>
          ))}
          {v.status !== "approved" && (
            <button type="button" className="btn btn-primary" disabled={busy || missing.length > 0} onClick={onApprove}>
              {missing.length ? "Approve (needs all documents)" : "Approve workshop"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
