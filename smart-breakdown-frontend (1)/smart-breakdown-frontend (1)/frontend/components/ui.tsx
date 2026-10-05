"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Role, Session } from "@/lib/types";
import { Icon } from "./Icon";

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <Icon name="wrench" size={Math.round(size * 0.55)} stroke="#F5A524" width={2.2} />
    </span>
  );
}

export function SosLink({ label = "SOS" }: { label?: string }) {
  return (
    <Link href="/sos" className="sos" aria-label="Emergency SOS">
      <Icon name="alert" size={16} width={2.4} />
      {label}
    </Link>
  );
}

export function LangButton() {
  const [hi, setHi] = useState(false);
  return (
    <button type="button" className="lang" onClick={() => setHi((v) => !v)} aria-label={hi ? "भाषा बदलें — हिंदी चुनी गई" : "Change language — English selected"}>
      {hi ? "हिं · EN" : "EN · हिं"}
    </button>
  );
}

export function Avatar({ initials, size = 56, tint = "#FFE3A8", label }: { initials: string; size?: number; tint?: string; label?: string }) {
  return (
    <span role="img" aria-label={label ?? `Photo of ${initials}`} className="avatar"
      style={{ width: size, height: size, background: tint, fontSize: Math.round(size * 0.34), borderRadius: Math.round(size / 4) }}>
      {initials}
    </span>
  );
}

const TINTS: Record<string, string> = { SA: "#FFE3A8", SB: "#DCE6F7", RG: "#D6E6D3", HR: "#F1DDE6", KF: "#E5E0F5", JA: "#E0EEF0" };
export const tintFor = (initials?: string | null) => TINTS[initials ?? ""] ?? "#E9ECF0";

export function Plate({ children }: { children: ReactNode }) {
  return <span className="plate">{children}</span>;
}

export function VerifiedBadge({ text = "Verified" }: { text?: string }) {
  return (
    <span className="badge b-verified">
      <Icon name="shield" size={12} width={2.6} />
      {text}
    </span>
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="row g4 bold small">
      <Icon name="star" size={13} fill="#E39A0E" stroke="none" />
      {value.toFixed(1)}
      {count != null && <span className="muted" style={{ fontWeight: 500 }}>({count})</span>}
    </span>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      style={{ width: 52, height: 44, border: 0, background: "transparent", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span className="switch" />
    </button>
  );
}

/** Bottom sheet (phone) — closes on backdrop click / Escape. */
export function Sheet({ open, onClose, labelledBy, children, centered = false }: {
  open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; centered?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, a, input, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={`backdrop${centered ? " centered" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={centered ? "dialog" : "sheet"}>
        {!centered && <span className="grabber" />}
        {children}
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  const node = msg ? <div role="status" className="toast">{msg}</div> : null;
  return { show, node };
}

export function Spinner({ size = 20, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity=".25" strokeWidth="3" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ConfidenceMeter({ level }: { level: "High" | "Medium" | "Low" }) {
  const n = level === "High" ? 3 : level === "Medium" ? 2 : 1;
  return (
    <span className="row g10">
      <span className="small" style={{ fontWeight: 600, color: "var(--navy-2)" }}>Confidence</span>
      <span aria-hidden="true" className="row g4">
        {[1, 2, 3].map((i) => (
          <span key={i} style={{ width: 22, height: 8, borderRadius: 4, background: i <= n ? "var(--blue)" : "var(--blue-line)" }} />
        ))}
      </span>
      <span className="bold" style={{ color: "var(--blue-ink)", fontSize: 14 }}>{level}</span>
    </span>
  );
}

export function SafetyCard({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="safety" style={{ overflow: "hidden" }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", minHeight: 52, padding: "0 14px", border: 0, background: "transparent", display: "flex", alignItems: "center", gap: 10, fontWeight: 700, textAlign: "left" }}>
        <Icon name="alert" stroke="#8A4B00" width={2.2} />
        <span className="grow">Stay safe while you wait</span>
        <span className="small muted" style={{ fontWeight: 600 }}>{open ? "Hide" : "5 tips"}</span>
      </button>
      {open && (
        <ol style={{ padding: "0 14px 14px 34px", display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
          <li>Turn on hazard lights</li>
          <li>Move to the shoulder if you can</li>
          <li>Place a warning triangle behind the vehicle</li>
          <li>Wait behind the crash barrier, away from traffic</li>
          <li>Verify the mechanic before handing over keys</li>
        </ol>
      )}
    </section>
  );
}

export function NetworkBanner({ text }: { text?: ReactNode }) {
  return (
    <div role="status" className="net-banner">
      <Icon name="wifi" stroke="#8A4B00" />
      <span className="grow">{text ?? <><b>Weak network.</b> Your details are saved on this phone. We&apos;ll retry automatically.</>}</span>
      <a href="tel:112" className="bold" style={{ color: "var(--red-ink)", flex: "none" }}>Call 112</a>
    </div>
  );
}

export function TopBar({ subtitle = "Roadside help · Jaipur", homeHref = "/", compact = false, children }: { subtitle?: string; homeHref?: string; compact?: boolean; children?: ReactNode }) {
  return (
    <header className={`topbar${compact ? " topbar-compact" : ""}`}>
      <div className="topbar-inner">
        <NavToggle />
        <Link href={homeHref} className="brand">
          <BrandMark />
          <span className="stack brand-text" style={{ minWidth: 0 }}>
            <span className="brand-name">Smart Breakdown</span>
            <span className="tiny muted brand-sub">{subtitle}</span>
          </span>
        </Link>
        {children}
      </div>
    </header>
  );
}

export const ROLE_LABEL: Record<Role, string> = { driver: "Driver", mechanic: "Mechanic", admin: "Control room" };
export const initialsFor = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** Navigation drawer state shared by the sidebar (AppNav) and the header hamburger. */
const NavContext = createContext<{ enabled: boolean; open: boolean; setOpen: (v: boolean) => void } | null>(null);
export const NavProvider = NavContext.Provider;

/** Hamburger shown in page headers below the desktop breakpoint, only where the sidebar is enabled. */
export function NavToggle() {
  const nav = useContext(NavContext);
  if (!nav?.enabled) return null;
  return (
    <button type="button" className="nav-toggle" aria-label="Open navigation menu" aria-controls="app-nav" aria-expanded={nav.open} onClick={() => nav.setOpen(true)}>
      <Icon name="menu" size={22} width={2.2} />
    </button>
  );
}

/** Circular account button with a compact dropdown (View profile · Logout). */
export function ProfileMenu({ session, initials, onLogout }: {
  session: Session; initials?: string; onLogout: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const cancelLogout = useCallback(() => setConfirmLogout(false), []);
  const ini = initials || initialsFor(session.name);
  const role = ROLE_LABEL[session.role];

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus();
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); ref.current?.querySelector<HTMLElement>(".profile-btn")?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const list = items();
        const i = list.indexOf(document.activeElement as HTMLElement);
        list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={ref} className="profile">
      <button type="button" className="profile-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu — signed in as ${session.name}`} onClick={() => setOpen((v) => !v)}>
        <span className="profile-avatar" aria-hidden="true">{ini}</span>
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="profile-menu">
          <div className="profile-head">
            <span className="profile-avatar lg" aria-hidden="true">{ini}</span>
            <span className="stack" style={{ minWidth: 0 }}>
              <b className="profile-name">{session.name}</b>
              <span className="tiny muted">{role}</span>
            </span>
          </div>
          <hr className="divider" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); setProfileOpen(true); }}><Icon name="user" size={18} />View profile</button>
          <hr className="divider" role="separator" />
          <button type="button" role="menuitem" className="danger" onClick={() => { setOpen(false); setConfirmLogout(true); }}><Icon name="logout" size={18} />Logout</button>
        </div>
      )}
      <ProfileDialog session={session} initials={ini} open={profileOpen} onClose={closeProfile} />
      <LogoutConfirm open={confirmLogout} onCancel={cancelLogout} onConfirm={() => { setConfirmLogout(false); onLogout(); router.replace("/login"); }} />
    </div>
  );
}

/** "View profile" dialog — used by the header menu and the sidebar account area. */
export function ProfileDialog({ session, initials, open, onClose }: {
  session: Session; initials?: string; open: boolean; onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="profile-h" centered>
      {/* Mounted only while open, so Cancel / Escape / backdrop always discard unsaved edits. */}
      <ProfileForm session={session} initials={initials || initialsFor(session.name)} onClose={onClose} />
    </Sheet>
  );
}

/**
 * Only the name exists in the session (from /api/auth/otp/verify). There is no username or contact
 * number in the session or API, and no profile-update endpoint, so these fields are UI-only and
 * Save stays disabled until the backend provides one.
 */
function ProfileForm({ session, initials, onClose }: { session: Session; initials: string; onClose: () => void }) {
  const [name, setName] = useState(session.name);
  const [username, setUsername] = useState("");
  const [contactType, setContactType] = useState<"mobile" | "phone">("mobile");
  const [contact, setContact] = useState("");
  const role = ROLE_LABEL[session.role];
  const notStored = <span className="badge b-grey">Not saved yet</span>;
  return (
    <form className="stack g16" onSubmit={(e) => e.preventDefault()}>
      <div className="row g12">
        <span className="profile-avatar xl" aria-hidden="true">{initials}</span>
        <div className="stack g4" style={{ minWidth: 0 }}>
          <h2 id="profile-h" className="h3 profile-name">{session.name}</h2>
          <span className="small muted">{role}</span>
        </div>
      </div>

      <hr className="divider" />
      <fieldset className="profile-section">
        <legend className="kicker muted">Personal information</legend>
        <div className="field">
          <label htmlFor="pf-name" className="label">Full name</label>
          <input id="pf-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-describedby="pf-name-help" />
          <span id="pf-name-help" className="small muted">From your sign-in. Edits aren&apos;t saved yet.</span>
        </div>
        <div className="field">
          <div className="row between g8"><label htmlFor="pf-user" className="label">Username</label>{notStored}</div>
          <input id="pf-user" className="input" autoComplete="username" placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
      </fieldset>

      <hr className="divider" />
      <fieldset className="profile-section">
        <legend className="kicker muted">Contact information</legend>
        <div className="field">
          <span id="pf-ctype" className="label">Contact type</span>
          <div role="group" aria-labelledby="pf-ctype" className="seg" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
            <button type="button" aria-pressed={contactType === "mobile"} onClick={() => setContactType("mobile")}>Mobile Number</button>
            <button type="button" aria-pressed={contactType === "phone"} onClick={() => setContactType("phone")}>Phone</button>
          </div>
        </div>
        <div className="field">
          <div className="row between g8"><label htmlFor="pf-contact" className="label">Contact number</label>{notStored}</div>
          <div className="input-group" style={{ height: 50, border: "1px solid var(--line-2)" }}>
            <span>+91</span>
            <input id="pf-contact" type="tel" inputMode="tel" autoComplete="tel-national" value={contact}
              placeholder={contactType === "mobile" ? "98765 43210" : "0141 234 5678"}
              onChange={(e) => setContact(e.target.value.replace(/[^\d ]/g, "").slice(0, 13))} />
          </div>
        </div>
      </fieldset>

      <p className="note small" role="note"><b>Saving isn&apos;t available yet.</b> There&apos;s no profile-update service, so changes here aren&apos;t stored.</p>
      <div className="profile-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled>Save Changes</button>
      </div>
    </form>
  );
}

/** "Log out?" confirmation — shown before any Logout (header menu, sidebar, drawer). */
export function LogoutConfirm({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet open={open} onClose={onCancel} labelledBy="logout-h" centered>
      <h2 id="logout-h" className="h2">Log out?</h2>
      <p className="muted">Are you sure you want to log out? You&apos;ll need to sign in again to use your dashboard.</p>
      <div className="grid2" style={{ gap: 10 }}>
        <button type="button" className="btn btn-lg" onClick={onCancel}>No</button>
        <button type="button" className="btn btn-dark btn-lg" onClick={onConfirm}>Yes, log out</button>
      </div>
    </Sheet>
  );
}
