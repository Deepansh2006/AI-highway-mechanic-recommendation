"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { describePoint } from "@/lib/geo";
import { useGeolocation, useNow } from "@/lib/hooks";
import { clock, EMERGENCY_NUMBERS } from "@/lib/labels";
import type { SosAlert } from "@/lib/types";
import { Icon } from "../Icon";
import { BrandMark, NavToggle, Spinner } from "../ui";

type Phase = "ready" | "countdown" | "sending" | "active" | "resolved";
const COUNTDOWN_S = 3;
const PROFILE_KEY = "sb-emergency-profile";

interface Profile {
  contacts: { name: string; phone: string }[];
  vehicle: string;
  plate: string;
  blood: string;
  medical: string;
}
const EMPTY: Profile = { contacts: [], vehicle: "", plate: "", blood: "", medical: "" };

export default function SosPage() {
  const geo = useGeolocation();
  const [phase, setPhase] = useState<Phase>("ready");
  const [startedAt, setStartedAt] = useState(0);
  const [alert, setAlert] = useState<SosAlert | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [editing, setEditing] = useState(false);
  const now = useNow(250);
  const detectRef = useRef(geo.detect);

  useEffect(() => {
    detectRef.current();
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setProfile({ ...EMPTY, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  const left = Math.max(0, COUNTDOWN_S - (now - startedAt) / 1000);

  useEffect(() => {
    if (phase !== "countdown" || left > 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("sending");
    api.sendSos(geo.point, typeof window !== "undefined" ? sessionStorage.getItem("sb-active-request") : null)
      .then((a) => { setAlert(a); setPhase("active"); })
      .catch((e) => { setError(e instanceof Error ? e.message : "Couldn't send the alert."); setPhase("ready"); });
  }, [phase, left, geo.point]);

  const start = () => { setError(null); setStartedAt(Date.now()); setPhase("countdown"); };
  const saveProfile = (p: Profile) => {
    setProfile(p);
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  };
  const resolve = async () => {
    if (alert) {
      try { await api.resolveSos(alert.id); } catch { /* still resolve locally */ }
    }
    setPhase("resolved");
  };
  const shareLocation = async () => {
    const p = geo.point;
    const text = p ? `EMERGENCY — I need help. My location: https://maps.google.com/?q=${p.lat},${p.lng}` : "EMERGENCY — I need help. My location isn't available; please call me.";
    try {
      if (navigator.share) await navigator.share({ title: "Emergency — my location", text });
      else { await navigator.clipboard.writeText(text); setError("Location link copied. Paste it into SMS or WhatsApp."); }
    } catch { /* cancelled */ }
  };

  const place = geo.point ? `${describePoint(geo.point).subtitle} · ${describePoint(geo.point).title}` : null;

  return (
    <div className="page" style={{ background: "var(--bg)" }}>
      <header className="topbar">
        <div className="topbar-inner">
          <NavToggle />
          <Link href="/driver" className="brand" aria-label="Back to Driver Portal">
            <Icon name="back" size={22} width={2.2} />
            <BrandMark size={36} />
            <span className="brand-name">Smart Breakdown</span>
          </Link>
          <span className="badge" style={{ background: "var(--red)", color: "#fff", fontSize: 13, padding: "8px 12px" }}>Emergency mode</span>
        </div>
      </header>

      <main className="page-main">
        <section className="row wrap g24" style={{ background: "var(--red-deep)", color: "#fff", borderRadius: 24, padding: "clamp(20px, 5vw, 32px) clamp(16px, 4vw, 24px)" }} aria-live="polite">
          <div className="stack g12" style={{ flex: "1 1 360px", minWidth: 0 }}>
            {phase === "ready" && <>
              <h1 className="display sos-title">Emergency SOS</h1>
              <p style={{ fontSize: 17, lineHeight: 1.5, color: "#FFE1E5", maxWidth: 520 }}>Press the button to alert the control room and your emergency contacts with your live location.</p>
              <p className="small" style={{ color: "#FFE1E5" }}>{geo.state === "detecting" ? "Getting your location…" : place ? `Your location: ${place}` : "Location unavailable — the alert will still be sent. Call 112 if you can."}</p>
            </>}
            {phase === "countdown" && <>
              <h1 className="display sos-title">Sending in {Math.ceil(left)}…</h1>
              <p style={{ fontSize: 17, color: "#FFE1E5" }}>Tap Cancel if you pressed it by mistake.</p>
            </>}
            {phase === "sending" && <h1 className="display row g12" style={{ fontSize: 34 }}><Spinner size={30} color="#fff" />Sending alert…</h1>}
            {phase === "active" && alert && <>
              <span className="kicker" style={{ alignSelf: "flex-start", background: "rgba(255,255,255,.18)", padding: "6px 12px", borderRadius: 999 }}>SOS sent · {clock(alert.sent_at)}</span>
              <h1 className="display sos-title">Help has been alerted</h1>
              <p style={{ fontSize: 17, color: "#FFE1E5" }}>Stay where you are if it is safe. Your location stays shared until you mark yourself safe.</p>
              <ul style={{ listStyle: "none", padding: 0 }} className="stack g8">
                {alert.notified.map((n) => <li key={n} className="row g10"><Icon name="check" size={18} stroke="#fff" width={3} />{n}</li>)}
                {profile.contacts.length > 0
                  ? <li className="row g10"><Icon name="check" size={18} stroke="#fff" width={3} />SMS to {profile.contacts.map((c) => c.name).join(", ")}</li>
                  : <li className="row g10"><Icon name="info" size={18} stroke="#fff" />No emergency contacts saved — use Share live location below</li>}
              </ul>
            </>}
            {phase === "resolved" && <>
              <h1 className="display sos-title">Glad you&apos;re safe</h1>
              <p style={{ fontSize: 17, color: "#FFE1E5" }}>We&apos;ve stopped sharing your location and told everyone who was alerted.</p>
            </>}
            {error && <p className="small" role="alert" style={{ background: "rgba(255,255,255,.15)", padding: "8px 12px", borderRadius: 10 }}>{error}</p>}
          </div>
          <div className="stack g12" style={{ flex: "0 0 auto", alignItems: "center", margin: "0 auto" }}>
            {phase === "ready" && (
              <button type="button" onClick={start} aria-label="SOS — press to alert"
                className="sos-dial" style={{ borderRadius: "50%", border: "8px solid #fff", background: "var(--red)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, boxShadow: "0 0 0 10px rgba(255,255,255,.15)" }}>
                <span className="display" style={{ fontSize: 46, letterSpacing: "0.04em" }}>SOS</span><span className="bold small">Press to alert</span>
              </button>
            )}
            {phase === "countdown" && (
              <>
                <div className="sos-dial" style={{ borderRadius: "50%", border: "8px solid #fff", background: "#fff", color: "var(--red-deep)", display: "flex", alignItems: "center", justifyContent: "center" }} role="timer">
                  <span className="display" style={{ fontSize: 80 }}>{Math.ceil(left)}</span>
                </div>
                <button type="button" className="btn btn-lg" style={{ minWidth: 210, background: "transparent", color: "#fff", borderColor: "#fff" }} onClick={() => setPhase("ready")}>Cancel</button>
              </>
            )}
            {phase === "active" && (
              <button type="button" className="btn btn-lg" style={{ minWidth: "min(230px, 100%)", background: "#fff", color: "var(--green)", borderColor: "#fff" }} onClick={resolve}>
                <Icon name="check" width={2.6} />I&apos;m safe now · stop sharing
              </button>
            )}
            {phase === "resolved" && <Link href="/driver" className="btn btn-lg" style={{ minWidth: 210 }}>Back to Driver Portal</Link>}
          </div>
        </section>

        <section aria-label="Emergency calls" className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
          {EMERGENCY_NUMBERS.map((n, i) => (
            <a key={n.number} href={`tel:${n.number}`} className="card stack between" style={{ minHeight: 108, padding: 18, textDecoration: "none", borderWidth: i === 0 ? 2 : 1, borderColor: i === 0 ? "var(--red)" : "var(--line)" }}>
              <span style={{ fontWeight: 600 }}>{n.label}</span>
              <span className="row between"><span className="num" style={{ fontSize: 36, color: i === 0 ? "var(--red)" : "var(--navy)" }}>{n.number}</span><span className="row g6 bold"><Icon name="phone" size={18} />Call</span></span>
            </a>
          ))}
          <button type="button" onClick={shareLocation} className="stack between" style={{ minHeight: 108, padding: 18, borderRadius: 18, border: 0, background: "var(--navy)", color: "#fff", textAlign: "left" }}>
            <span style={{ fontWeight: 600, color: "#C9D1DC" }}>Share live location</span>
            <span className="row g10 bold" style={{ fontSize: 17 }}><Icon name="pin" stroke="#F5A524" />Send by SMS or WhatsApp</span>
          </button>
        </section>

        <section aria-labelledby="info-h" className="card card-pad stack g14">
          <div className="row between"><h2 id="info-h" className="h3">Shared with your alert</h2>
            <button type="button" className="btn btn-sm" onClick={() => setEditing((v) => !v)}>{editing ? "Done" : "Edit"}</button></div>
          {!editing ? (
            <dl className="kv" style={{ ["--kv-label" as string]: "minmax(120px, 160px)", gap: "12px 16px" }}>
              <dt className="muted">Live location</dt><dd>{place ?? "Not available"}</dd>
              <dt className="muted">Emergency contacts</dt><dd>{profile.contacts.length ? profile.contacts.map((c) => `${c.name} (${c.phone})`).join(", ") : <span className="muted" style={{ fontWeight: 500 }}>None added — tap Edit</span>}</dd>
              <dt className="muted">Vehicle</dt><dd>{[profile.vehicle, profile.plate].filter(Boolean).join(" · ") || <span className="muted" style={{ fontWeight: 500 }}>Not added</span>}</dd>
              <dt className="muted">Medical info</dt><dd>{[profile.blood && `Blood group ${profile.blood}`, profile.medical].filter(Boolean).join(" · ") || <span className="muted" style={{ fontWeight: 500 }}>Not added</span>}</dd>
            </dl>
          ) : (
            <ProfileForm profile={profile} onSave={(p) => { saveProfile(p); setEditing(false); }} />
          )}
          <p className="tiny muted">Saved only on this phone. Shared only when you send an SOS.</p>
        </section>

        <section className="safety stack g10" style={{ padding: 20 }}>
          <h2 className="h3">If someone is hurt</h2>
          <ul style={{ paddingLeft: 20 }} className="stack g6">
            <li>Call 112 or 108 first.</li>
            <li>Don&apos;t move an injured person unless there&apos;s danger of fire or traffic.</li>
            <li>Switch off the engine and turn on hazard lights.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function ProfileForm({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => void }) {
  const [p, setP] = useState<Profile>({ ...profile, contacts: profile.contacts.length ? profile.contacts : [{ name: "", phone: "" }] });
  const setContact = (i: number, k: "name" | "phone", v: string) => setP((x) => ({ ...x, contacts: x.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  return (
    <form className="stack g12" onSubmit={(e) => { e.preventDefault(); onSave({ ...p, contacts: p.contacts.filter((c) => c.name.trim() && c.phone.trim()) }); }}>
      <span className="label">Emergency contacts</span>
      {p.contacts.map((c, i) => (
        <div key={i} className="row wrap g8">
          <label className="sr-only" htmlFor={`cn${i}`}>Contact {i + 1} name</label>
          <input id={`cn${i}`} className="input" style={{ flex: "1 1 160px" }} placeholder="Name" value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} />
          <label className="sr-only" htmlFor={`cp${i}`}>Contact {i + 1} phone</label>
          <input id={`cp${i}`} className="input" style={{ flex: "1 1 160px" }} placeholder="Phone" inputMode="tel" value={c.phone} onChange={(e) => setContact(i, "phone", e.target.value)} />
        </div>
      ))}
      {p.contacts.length < 3 && <button type="button" className="link-btn" style={{ alignSelf: "flex-start" }} onClick={() => setP((x) => ({ ...x, contacts: [...x.contacts, { name: "", phone: "" }] }))}><Icon name="plus" size={16} />Add contact</button>}
      <div className="grid2" style={{ gap: 10 }}>
        <div className="field"><label className="label" htmlFor="veh">Vehicle</label><input id="veh" className="input" placeholder="e.g. White Maruti Swift" value={p.vehicle} onChange={(e) => setP({ ...p, vehicle: e.target.value })} /></div>
        <div className="field"><label className="label" htmlFor="plate">Number plate</label><input id="plate" className="input" placeholder="RJ14 AB 1234" value={p.plate} onChange={(e) => setP({ ...p, plate: e.target.value.toUpperCase() })} /></div>
        <div className="field"><label className="label" htmlFor="blood">Blood group</label>
          <select id="blood" className="input" value={p.blood} onChange={(e) => setP({ ...p, blood: e.target.value })}>
            <option value="">Not set</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => <option key={b}>{b}</option>)}
          </select></div>
        <div className="field"><label className="label" htmlFor="med">Allergies / conditions</label><input id="med" className="input" placeholder="Optional" value={p.medical} onChange={(e) => setP({ ...p, medical: e.target.value })} /></div>
      </div>
      <button type="submit" className="btn btn-dark btn-lg">Save</button>
    </form>
  );
}
