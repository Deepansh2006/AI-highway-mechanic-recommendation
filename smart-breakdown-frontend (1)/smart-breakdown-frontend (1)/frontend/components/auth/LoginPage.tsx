"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, isDemoMode } from "@/lib/api";
import { HOME_FOR_ROLE, useNow, useSession } from "@/lib/hooks";
import type { OtpChallenge, Role } from "@/lib/types";
import { Icon } from "../Icon";
import { LangButton, SosLink, Spinner, TopBar } from "../ui";

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
  const [showPw, setShowPw] = useState(false);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      const c = await api.sendOtp({ role, phone: role === "admin" ? undefined : phone, email: role === "admin" ? email : undefined, password: role === "admin" ? password : undefined });
      setChallenge(c);
      setSentAt(Date.now());
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
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
            {!challenge ? (
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
                {role === "mechanic" && <span className="small center" style={{ color: "var(--navy-2)" }}>New mechanic? <a href="mailto:partners@example.com" className="bold">Apply to become a verified partner</a></span>}
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
                {isDemoMode && <p className="note small">Demo mode: use code <b>{challenge.demo_code}</b>.</p>}
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
          <p className="tiny muted center">By continuing you agree to the Terms and Privacy Policy. Your location is shared only during an active request.</p>
        </section>
      </main>
    </div>
  );
}
