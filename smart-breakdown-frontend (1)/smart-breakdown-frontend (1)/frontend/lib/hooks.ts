"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isDemoMode } from "./api";
import { DEMO_POSITION, haversineKm } from "./geo";
import type { GeoPoint, Role, Session } from "./types";

/** Re-renders every `ms` and returns the current time. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Calls `fn` now and every `ms` while `enabled`. Latest fn is always used. */
export function usePolling(fn: () => void | Promise<void>, ms: number, enabled = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = async () => {
      if (alive) await ref.current();
    };
    run();
    const t = setInterval(run, ms);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ms, enabled]);
}

/** Browser connectivity. `weak` is true when offline or on a 2G-class connection. */
export function useNetwork() {
  const [state, setState] = useState({ online: true, weak: false });
  useEffect(() => {
    type NavConn = { effectiveType?: string; addEventListener?: (e: string, f: () => void) => void; removeEventListener?: (e: string, f: () => void) => void };
    const conn = (navigator as Navigator & { connection?: NavConn }).connection;
    const read = () => {
      const online = navigator.onLine;
      const slow = !!conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType);
      setState({ online, weak: !online || slow });
    };
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    conn?.addEventListener?.("change", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
      conn?.removeEventListener?.("change", read);
    };
  }, []);
  return state;
}

export type LocState = "idle" | "detecting" | "detected" | "weak" | "denied" | "unavailable" | "manual";

const JAIPUR = { lat: 26.9124, lng: 75.7873 };
const WEAK_ACCURACY_M = 100;

/** Real browser geolocation with the states the Driver Portal designs for. */
export function useGeolocation() {
  const [state, setState] = useState<LocState>("idle");
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [demoSubstituted, setDemoSubstituted] = useState(false);

  const detect = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unavailable");
      return;
    }
    setState("detecting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        let p: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: Math.round(pos.coords.accuracy) };
        let substituted = false;
        if (isDemoMode && haversineKm(p, JAIPUR) > 60) {
          p = { ...DEMO_POSITION };
          substituted = true;
        }
        setDemoSubstituted(substituted);
        setPoint(p);
        setState((p.accuracy_m ?? 0) > WEAK_ACCURACY_M ? "weak" : "detected");
      },
      (err) => {
        setState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  const setManual = useCallback((p: GeoPoint) => {
    setPoint(p);
    setState("manual");
  }, []);

  return { state, point, detect, setManual, setState, demoSubstituted };
}

const SESSION_KEY = "sb-session";
const SESSION_EVENT = "sb-session-change";

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function writeSession(s: Session | null) {
  try {
    if (s) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      window.localStorage.setItem("sb-token", s.token);
    } else {
      window.localStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem("sb-token");
    }
  } catch {
    /* storage blocked */
  }
  // Keep every useSession() instance (page, header menu, sidebar) in step.
  window.dispatchEvent(new Event(SESSION_EVENT));
}

/** Where each role lands after signing in (and when opening the site while signed in). */
export const HOME_FOR_ROLE: Record<Role, string> = { driver: "/driver", mechanic: "/mechanic", admin: "/admin" };

/** Session from localStorage; `ready` is false until read on the client. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setSession(readSession());
    sync();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { session, ready, setSession: (s: Session | null) => { writeSession(s); setSession(s); } };
}
