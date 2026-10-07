"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, isDemoMode } from "@/lib/api";
import { HOME_FOR_ROLE, useNow, useSession } from "@/lib/hooks";
import type { OtpChallenge, Role } from "@/lib/types";
import { Icon } from "../Icon";
import { LangButton, Sheet, SosLink, Spinner, TopBar } from "../ui";

const ROLES: { key: Role; label: string }[] = [
  { key: "driver", label: "Driver" },
  { key: "mechanic", label: "Mechanic" },
  { key: "admin", label: "Control room" },
];

export default function LoginPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { session, ready, setSession } = useSession();
  const initialRole = (ROLES.find((r) => r.key === params.get("role"))?.key ?? "mechanic") as Role;
  const [role, setRole] = useState<Role>(initialRole);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [vehicleLabel, setVehicleLabel] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [area, setArea] = useState("Jaipur");
  const [capabilities, setCapabilities] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locating, setLocating] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [demoCodeOpen, setDemoCodeOpen] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRegistrationSuccess = useCallback(() => setRegistrationSuccess(false), []);
  const now = useNow(1000);
  const resendIn = Math.max(0, 30 - Math.floor((now - sentAt) / 1000));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
  }, [role]);

  // Already signed in: skip the form and go straight to the dashboard.
  const signedIn = ready && !!session && !challenge;
  useEffect(() => {
    if (signedIn && session) router.replace(HOME_FOR_ROLE[session.role]);
  }, [signedIn, session, router]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.sendOtp({ role, phone: role === "admin" ? undefined : phone.replace(/\D/g, ""), email: role === "admin" ? email : undefined, password: role === "admin" ? password : undefined });
      setChallenge(c);
      setDemoCodeOpen(!!c.demo_code);
      setSentAt(Date.now());
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  };

  const useDemoCode = () => {
    const demoCode = challenge?.demo_code;
    if (!demoCode) return;
    setCode(demoCode);
    setDemoCodeOpen(false);
  };

  const verify = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const s = await api.verifyOtp(challenge.challenge_id, code);
      setSession(s);
      const next = params.get("next");
      router.push(next && next.startsWith("/") ? next : HOME_FOR_ROLE[s.role]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't verify the code.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const locateWorkshop = () => {
    if (!navigator.geolocation) {
      setError("Location is unavailable in this browser. Enter latitude and longitude manually.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("Couldn't get your location. Allow location access or enter coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const register = async () => {
    const normalizedPhone = phone.replace(/\D/g, "");
    if (normalizedPhone.length !== 10) {
      setError("Enter a 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.registerMechanic({
        business_name: businessName.trim(),
        phone_number: normalizedPhone,
        latitude: Number(latitude),
        longitude: Number(longitude),
        owner_name: ownerName.trim() || undefined,
        vehicle_label: vehicleLabel.trim() || undefined,
        vehicle_plate: vehiclePlate.trim() || undefined,
        area: area.trim() || undefined,
        capabilities: capabilities.split(",").map((item) => item.trim()).filter(Boolean),
      });
      setPhone(normalizedPhone);
      setRegistrationSuccess(true);
      setRegistering(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit your registration.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready || signedIn) return <div className="page" aria-busy="true" />;
  return (
    <div className="page">
      <TopBar><LangButton /><SosLink /></TopBar>
      <main className="page-main page-narrow" style={{ ["--narrow" as string]: "460px", flex: 1, justifyContent: "center" }}>
        <section aria-labelledby="si-h" className="stack g16">
          <Link href="/driver" className="row g12" style={{ background: "var(--amber-tint)", border: "1px solid var(--amber-line)", borderRadius: 14, padding: "12px 14px", textDecoration: "none" }}>
            <Icon name="nav" size={22} stroke="var(--amber-ink)" width={2.2} />
            <span className="stack grow"><b>Stranded right now?</b><span className="small" style={{ color: "var(--navy-2)" }}>Get a mechanic without signing in</span></span>
            <Icon name="chevronRight" />
          </Link>

          <div className="card stack g16" style={{ padding: "24px 20px", borderRadius: 22 }}>
            {!challenge ? registering ? (
              <form className="stack g16" onSubmit={(e) => { e.preventDefault(); register(); }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", marginLeft: -10 }}
                  onClick={() => { setRegistering(false); setError(null); }}>
                  <Icon name="back" size={18} />Back to sign in
                </button>
                <div className="stack g6">
                  <h1 id="si-h" className="h1">Become a verified partner</h1>
                  <p className="muted">Register your workshop to receive roadside service requests.</p>
                </div>
                <div className="field">
                  <label htmlFor="business-name" className="label">Workshop name</label>
                  <input id="business-name" className="input" required maxLength={255} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="owner-name" className="label">Owner name</label>
                  <input id="owner-name" className="input" maxLength={255} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="register-phone" className="label">Mobile number</label>
                  <div className="input-group">
                    <span>+91</span>
                    <input id="register-phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210"
                      required value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="vehicle-label" className="label">Service vehicle</label>
                  <input id="vehicle-label" className="input" placeholder="e.g. Mobile van" maxLength={100} value={vehicleLabel} onChange={(e) => setVehicleLabel(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="vehicle-plate" className="label">Vehicle registration number</label>
                  <input id="vehicle-plate" className="input" maxLength={20} value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="area" className="label">Service area</label>
                  <input id="area" className="input" maxLength={255} value={area} onChange={(e) => setArea(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="capabilities" className="label">Services offered</label>
                  <input id="capabilities" className="input" placeholder="Tyre repair, battery, towing" value={capabilities} onChange={(e) => setCapabilities(e.target.value)} />
                  <span className="small muted">Separate services with commas.</span>
                </div>
                <div className="field">
                  <label className="label">Workshop location</label>
                  <button type="button" className="btn btn-block" onClick={locateWorkshop} disabled={locating}>
                    <Icon name="nav" size={18} />{locating ? "Getting location…" : "Use my current location"}
                  </button>
                  <div className="grid2">
                    <div className="field">
                      <label htmlFor="latitude" className="small muted">Latitude</label>
                      <input id="latitude" className="input" type="number" step="any" min="-90" max="90" required value={latitude} onChange={(e) => setLatitude(e.target.value)} />
                    </div>
                    <div className="field">
                      <label htmlFor="longitude" className="small muted">Longitude</label>
                      <input id="longitude" className="input" type="number" step="any" min="-180" max="180" required value={longitude} onChange={(e) => setLongitude(e.target.value)} />
                    </div>
                  </div>
                </div>
                {error && <span className="error-text" role="alert"><Icon name="info" size={18} />{error}</span>}
                {isDemoMode && <p className="note small">Demo mode: registration is simulated and won&apos;t be saved to the backend.</p>}
                <button type="submit" className="btn btn-primary btn-lg" disabled={busy || locating}>{busy ? <Spinner /> : "Submit registration"}</button>
              </form>
            ) : (
              <form className="stack g16" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <div className="stack g6">
                  <h1 id="si-h" className="h1">Sign in</h1>
                  <p className="muted">Choose who you are to continue.</p>
                </div>
                <div role="tablist" aria-label="Account type" className="seg" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", borderRadius: 14 }}>
                  {ROLES.map((r) => (
                    <button key={r.key} type="button" role="tab" aria-selected={role === r.key} onClick={() => setRole(r.key)} style={{ minHeight: 48 }}>{r.label}</button>
                  ))}
                </div>
                {role === "driver" && <p className="note">You don&apos;t need an account to get help. Sign in to see past requests, receipts and saved emergency contacts.</p>}
                {role === "mechanic" && <p className="note">Use the mobile number registered with your verified workshop.</p>}
                {role !== "admin" ? (
                  <div className="field">
                    <label htmlFor="phone" className="label">Mobile number</label>
                    <div className="input-group">
                      <span>+91</span>
                      <input id="phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))} aria-describedby="phone-help" />
                    </div>
                    <span id="phone-help" className="small muted">We&apos;ll send a 6-digit code by SMS.</span>
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label htmlFor="email" className="label">Work email</label>
                      <input id="email" className="input" type="email" autoComplete="username" placeholder="name@organisation.in" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="field">
                      <div className="row between" style={{ alignItems: "baseline" }}>
                        <label htmlFor="pw" className="label">Password</label>
                        <a href="#" className="small" style={{ fontWeight: 600 }} onClick={(e) => { e.preventDefault(); setError("Ask your control-room supervisor to reset your password."); }}>Forgot password?</a>
                      </div>
                      <div className="input-group" style={{ height: 52, border: "1px solid var(--line-2)" }}>
                        <input id="pw" type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ fontSize: 16 }} />
                        <button type="button" className="btn btn-ghost btn-sm" style={{ height: "100%", borderRadius: 0, color: "var(--blue-ink)" }} onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>{showPw ? "Hide" : "Show"}</button>
                      </div>
                    </div>
                    <span className="row g8 small" style={{ color: "var(--navy-2)" }}><Icon name="lock" size={16} />A 6-digit code from your phone is needed next.</span>
                  </>
                )}
                {error && <span className="error-text" role="alert"><Icon name="info" size={18} />{error}</span>}
                <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? <Spinner /> : role === "admin" ? "Continue" : "Send OTP"}</button>
                {role === "mechanic" && <span className="small center" style={{ color: "var(--navy-2)" }}>New mechanic? <button type="button" className="link-btn bold" style={{ minHeight: "auto", display: "inline", textDecoration: "underline" }} onClick={() => { setRegistering(true); setRegistrationSuccess(false); setError(null); }}>Apply to become a verified partner</button></span>}
              </form>
            ) : (
              <form className="stack g16" onSubmit={(e) => { e.preventDefault(); verify(); }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start", marginLeft: -10 }} onClick={() => { setChallenge(null); setError(null); }}>
                  <Icon name="back" size={18} />{role === "admin" ? "Back" : "Change number"}
                </button>
                <div className="stack g6">
                  <h1 id="si-h" className="h1">Enter the code</h1>
                  <p className="muted">{role === "admin" ? "Enter the 6-digit code from your authenticator app." : `Sent by SMS to ${challenge.sent_to}. It expires in ${Math.round(challenge.expires_in_s / 60)} minutes.`}</p>
                </div>
                <label htmlFor="otp" className="sr-only">6-digit code</label>
                <input id="otp" className="input num" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  style={{ height: 64, fontSize: 30, letterSpacing: "0.5em", textAlign: "center", border: `2px solid ${error ? "#B54708" : "var(--navy)"}`, background: error ? "#FFF8F0" : "#fff" }}
                  aria-invalid={!!error} aria-describedby={error ? "otp-err" : undefined} autoFocus />
                {error && <span id="otp-err" className="error-text" role="alert"><Icon name="info" size={18} />{error}</span>}
                <button type="submit" className="btn btn-primary btn-lg" disabled={busy || code.length !== 6}>{busy ? <Spinner /> : "Verify & Sign in"}</button>
                {role !== "admin" && (
                  <div className="row wrap between g8 small">
                    {resendIn > 0 ? <span className="muted">Resend code in <b style={{ color: "var(--navy)" }}>0:{String(resendIn).padStart(2, "0")}</b></span>
                      : <button type="button" className="link-btn" onClick={send}>Resend code</button>}
                  </div>
                )}
              </form>
            )}
          </div>
          <Sheet open={demoCodeOpen && !!challenge?.demo_code} onClose={() => setDemoCodeOpen(false)} labelledBy="demo-code-title" centered>
            {challenge?.demo_code && (
              <div className="stack g16" style={{ alignItems: "center", textAlign: "center" }}>
                <div className="stack g6">
                  <h2 id="demo-code-title" className="h2">Your demo sign-in code</h2>
                  <p className="muted">Enter this code to finish signing in.</p>
                </div>
                <p className="h1 num" aria-label={`Demo code ${challenge.demo_code}`} style={{ letterSpacing: "0.3em" }}>{challenge.demo_code}</p>
                <button type="button" className="btn btn-primary btn-block" onClick={useDemoCode}>
                  Use this code
                </button>
              </div>
            )}
          </Sheet>
          <Sheet open={registrationSuccess} onClose={closeRegistrationSuccess} labelledBy="registration-success-title" centered>
            <div className="stack g16" style={{ alignItems: "center", textAlign: "center" }}>
              <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="check" size={32} stroke="#fff" width={2.8} />
              </span>
              <div className="stack g6">
                <h2 id="registration-success-title" className="h2">Registration successful</h2>
                <p className="muted" role="status">Your mechanic registration has been submitted successfully. Sign in with your registered mobile number to continue.</p>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={closeRegistrationSuccess}>Continue to sign in</button>
            </div>
          </Sheet>
          <p className="tiny muted center">By continuing you agree to the Terms and Privacy Policy. Your location is shared only during an active request.</p>
        </section>
      </main>
    </div>
  );
}
