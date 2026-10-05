"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HOME_FOR_ROLE, useSession } from "@/lib/hooks";
import { Icon, type IconName } from "./Icon";
import { BrandMark, initialsFor, LogoutConfirm, NavProvider, ProfileDialog, ROLE_LABEL } from "./ui";

/** Routes that get the navigation. Login and the "/" redirect stay a clean single screen. */
const NAV_ROUTES = ["/driver", "/mechanic", "/admin", "/feedback", "/sos"];

type NavLink = { href: string; label: string; icon: IconName };
const DRIVER_PORTAL: NavLink = { href: "/driver", label: "Driver Portal", icon: "car" };
const FEEDBACK: NavLink = { href: "/feedback", label: "Feedback", icon: "star" };

const COLLAPSE_KEY = "sb-nav-collapsed";
const DESKTOP = "(min-width: 1024px)";

/** Fixed, collapsible sidebar on desktop; slide-out drawer (opened from the header hamburger) below 1024px. */
export function AppNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const enabled = NAV_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  const { session, setSession } = useSession();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [desktop, setDesktop] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const cancelLogout = useCallback(() => setConfirmLogout(false), []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    let saved = false;
    try { saved = window.localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(saved);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Close the drawer after navigating or when the screen grows to desktop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname, desktop]);

  useEffect(() => {
    if (!open) return;
    navRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
      document.querySelector<HTMLElement>(".nav-toggle")?.focus();
    };
  }, [open]);

  const toggleCollapsed = () => setCollapsed((v) => {
    try { window.localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1"); } catch { /* storage blocked */ }
    return !v;
  });

  const compact = desktop && collapsed;
  const home = session ? HOME_FOR_ROLE[session.role] : null;
  // Signed in: one "Dashboard" link to the role's home (HOME_FOR_ROLE). Signed out: the public Driver Portal.
  const links: NavLink[] = [home ? { href: home, label: "Dashboard", icon: "layers" } : DRIVER_PORTAL, FEEDBACK];
  const current = (href: string) => (pathname === href ? "page" : undefined);
  const tip = (label: string) => (compact ? label : undefined);

  return (
    <NavProvider value={{ enabled, open, setOpen }}>
      {enabled && (
        <>
          {!desktop && open && <div className="nav-backdrop" onClick={() => setOpen(false)} />}
          <nav id="app-nav" ref={navRef} aria-label="Main" inert={!desktop && !open}
            className={`sidenav${compact ? " collapsed" : ""}${open ? " open" : ""}`}>
            <div className="sidenav-top">
              <Link href={home ?? "/driver"} className="sidenav-brand" aria-label="Smart Breakdown home">
                <BrandMark size={36} /><span className="sidenav-label">Smart Breakdown</span>
              </Link>
              {desktop ? (
                <button type="button" className="sidenav-icon-btn" onClick={toggleCollapsed} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} title={compact ? "Expand sidebar" : "Collapse sidebar"}>
                  <Icon name="back" size={18} width={2.2} style={compact ? { transform: "rotate(180deg)" } : undefined} />
                </button>
              ) : (
                <button type="button" className="sidenav-icon-btn" onClick={() => setOpen(false)} aria-label="Close navigation menu">
                  <Icon name="x" size={20} width={2.2} />
                </button>
              )}
            </div>

            <ul className="sidenav-list">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="sidenav-link" aria-current={current(l.href)} title={tip(l.label)}>
                    <Icon name={l.icon} /><span className="sidenav-label">{l.label}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <Link href="/sos" className="sidenav-link sidenav-sos" aria-current={current("/sos")} title={tip("Emergency SOS")}>
              <Icon name="alert" width={2.4} /><span className="sidenav-label">Emergency SOS</span>
            </Link>

            <hr className="sidenav-sep" />
            <div className="sidenav-account">
              {session ? (
                <>
                  <button type="button" className="sidenav-link sidenav-profile" onClick={() => { setOpen(false); setProfileOpen(true); }}
                    aria-label={`View profile — signed in as ${session.name}`} title={tip(session.name)}>
                    <span className="profile-avatar" aria-hidden="true">{initialsFor(session.name)}</span>
                    <span className="sidenav-label stack" style={{ minWidth: 0 }}>
                      <b className="profile-name">{session.name}</b>
                      <span className="tiny muted">{ROLE_LABEL[session.role]}</span>
                    </span>
                  </button>
                  <button type="button" className="sidenav-link" onClick={() => { setOpen(false); setConfirmLogout(true); }} title={tip("Logout")}>
                    <Icon name="logout" /><span className="sidenav-label">Logout</span>
                  </button>
                </>
              ) : (
                <Link href="/login" className="sidenav-link" title={tip("Sign in")}><Icon name="user" /><span className="sidenav-label">Sign in</span></Link>
              )}
            </div>
          </nav>
          {session && <ProfileDialog session={session} open={profileOpen} onClose={closeProfile} />}
          <LogoutConfirm open={confirmLogout} onCancel={cancelLogout} onConfirm={() => { setConfirmLogout(false); setSession(null); router.replace("/login"); }} />
        </>
      )}
      <div className={enabled ? `nav-content${compact ? " collapsed" : ""}` : undefined}>{children}</div>
    </NavProvider>
  );
}
