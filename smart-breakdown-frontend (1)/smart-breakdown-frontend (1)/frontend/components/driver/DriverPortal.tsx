"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useGeolocation, useNetwork, usePolling, useSession } from "@/lib/hooks";
import { describePoint } from "@/lib/geo";
import type { GeoPoint, Issue, Recommendation, RecommendResult, ServiceRequest, SortKey, Vehicle } from "@/lib/types";
import { Icon } from "../Icon";
import { BrandMark, LangButton, NavToggle, NetworkBanner, ProfileMenu, SosLink, useToast } from "../ui";
import {
  BottomBar, CancelDialog, ConfirmSheet, DiagnosisScreen, LocationScreen, MechanicsScreen, ProblemScreen,
  ReceiptSheet, RequestScreens, StartScreen,
} from "./screens";

type Screen = "start" | "location" | "problem" | "diagnosis" | "mechanics" | "request";
const STEP: Partial<Record<Screen, [number, string]>> = {
  location: [1, "Location"],
  problem: [2, "Vehicle & problem"],
  diagnosis: [3, "AI diagnosis"],
  mechanics: [4, "Choose a mechanic"],
};
const BACK: Partial<Record<Screen, Screen>> = { location: "start", problem: "location", diagnosis: "problem", mechanics: "diagnosis" };
const ACTIVE_KEY = "sb-active-request";

export default function DriverPortal() {
  const [screen, setScreen] = useState<Screen>("start");
  const geo = useGeolocation();
  const net = useNetwork();
  const toast = useToast();
  // Account menu only for a signed-in driver; the public portal stays login-free.
  const { session, setSession } = useSession();
  const driverSession = session?.role === "driver" ? session : null;
  const [landmark, setLandmark] = useState("");

  const [vehicle, setVehicle] = useState<Vehicle>("car");
  const [issue, setIssue] = useState<Issue | null>(null);
  const [description, setDescription] = useState("");

  const [result, setResult] = useState<RecommendResult | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("best");

  const [confirm, setConfirm] = useState<Recommendation | null>(null);
  const [sending, setSending] = useState(false);
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [connLost, setConnLost] = useState(false);
  const [receipt, setReceipt] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const point: GeoPoint | null = useMemo(() => {
    if (!geo.point) return null;
    const label = geo.point.label || describePoint(geo.point).subtitle + ", " + describePoint(geo.point).title;
    return { ...geo.point, label: landmark ? `${label} · landmark: ${landmark}` : label };
  }, [geo.point, landmark]);

  // Resume an active request after a refresh.
  useEffect(() => {
    const id = sessionStorage.getItem(ACTIVE_KEY);
    if (!id) return;
    api.getRequest(id).then((r) => {
      if (!["completed", "cancelled"].includes(r.status)) {
        setRequest(r);
        setScreen("request");
      } else sessionStorage.removeItem(ACTIVE_KEY);
    }).catch(() => sessionStorage.removeItem(ACTIVE_KEY));
  }, []);

  const polling = screen === "request" && !!request && !["completed", "cancelled", "unassigned"].includes(request.status);
  usePolling(async () => {
    if (!request) return;
    try {
      const r = await api.getRequest(request.id);
      setRequest(r);
      setConnLost(false);
      if (r.status === "completed") sessionStorage.removeItem(ACTIVE_KEY);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setConnLost(true);
    }
  }, 3000, polling);

  const loadRecommendations = useCallback(async () => {
    if (!point || !issue) return;
    setLoadingRec(true);
    setRecError(null);
    setScreen("diagnosis");
    try {
      const r = await api.recommend({ lat: point.lat, lng: point.lng, vehicle, issue, description, sort: "best" });
      setResult(r);
      setSort("best");
    } catch (e) {
      setRecError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoadingRec(false);
    }
  }, [point, issue, vehicle, description]);

  const sendRequest = async () => {
    if (!confirm || !point || !issue) return;
    setSending(true);
    try {
      const r = await api.createRequest({ location: point, vehicle, issue, description, mechanic_id: confirm.mechanic_id });
      sessionStorage.setItem(ACTIVE_KEY, r.id);
      setRequest(r);
      setConfirm(null);
      setScreen("request");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't send the request.");
    } finally {
      setSending(false);
    }
  };

  const run = async (fn: () => Promise<ServiceRequest>) => {
    setBusy(true);
    try {
      setRequest(await fn());
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = async (reason: string) => {
    if (!request) return;
    try {
      await api.cancelRequest(request.id, reason);
    } catch { /* still leave the screen */ }
    sessionStorage.removeItem(ACTIVE_KEY);
    setCancelOpen(false);
    setRequest(null);
    setScreen(result ? "mechanics" : "start");
    toast.show("Request cancelled.");
  };

  const restart = () => {
    sessionStorage.removeItem(ACTIVE_KEY);
    setRequest(null);
    setResult(null);
    setIssue(null);
    setDescription("");
    setScreen("start");
  };

  const step = STEP[screen];
  const sorted = useMemo(() => {
    const list = result?.mechanics ?? [];
    if (sort === "nearest") return [...list].sort((a, b) => a.distance_km - b.distance_km);
    if (sort === "top") return [...list].sort((a, b) => b.rating - a.rating);
    return list;
  }, [result, sort]);
  const best = result?.mechanics.find((m) => m.is_best) ?? result?.mechanics[0] ?? null;

  return (
    <div className="app-shell">
      <div className="app">
        <header className="topbar" style={{ position: "sticky", top: 0, zIndex: 30 }}>
          <div className="topbar-inner">
            <NavToggle />
            <button type="button" className="brand" onClick={() => (screen === "request" ? undefined : setScreen("start"))} aria-label="Smart Breakdown home">
              <BrandMark size={38} />
              <span className="stack" style={{ minWidth: 0 }}>
                <span className="brand-name">Smart Breakdown</span>
                <span className="tiny muted brand-sub">Roadside help · Jaipur</span>
              </span>
            </button>
            <LangButton />
            <SosLink />
            {driverSession && <ProfileMenu session={driverSession} onLogout={() => setSession(null)} />}
          </div>
          {(net.weak || connLost) && <NetworkBanner text={connLost ? <><b>Connection lost.</b> Your request is saved. Retrying every few seconds.</> : undefined} />}
          {step && (
            <div className="steps">
              <div className="row g8">
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: -10, padding: "0 8px" }} aria-label="Back" onClick={() => setScreen(BACK[screen] ?? "start")}>
                  <Icon name="back" size={22} width={2.2} />
                </button>
                <span className="small muted" style={{ fontWeight: 600 }}>Step {step[0]} of 4</span>
                <span className="bold">· {step[1]}</span>
              </div>
              <div className="steps-bars" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => <span key={i} className={i <= step[0] ? "on" : ""} />)}
              </div>
            </div>
          )}
        </header>

        <main className="app-body">
          {screen === "start" && <StartScreen />}
          {screen === "location" && (
            <LocationScreen geo={geo} landmark={landmark} setLandmark={setLandmark} />
          )}
          {screen === "problem" && (
            <ProblemScreen vehicle={vehicle} setVehicle={setVehicle} issue={issue} setIssue={setIssue} description={description} setDescription={setDescription} />
          )}
          {screen === "diagnosis" && (
            <DiagnosisScreen loading={loadingRec} error={recError} result={result} vehicle={vehicle} issue={issue} onEdit={() => setScreen("problem")} onRetry={loadRecommendations} />
          )}
          {screen === "mechanics" && result && (
            <MechanicsScreen result={result} list={sorted} sort={sort} setSort={setSort} onRequest={setConfirm} />
          )}
          {screen === "request" && request && (
            <RequestScreens request={request} busy={busy} onCancel={() => setCancelOpen(true)}
              onConfirmMechanic={() => run(() => api.confirmMechanic(request.id))}
              onRetry={() => { restart(); }} />
          )}
        </main>

        <BottomBar
          screen={screen}
          geoState={geo.state}
          hasPoint={!!geo.point}
          issueChosen={!!issue}
          request={request}
          best={best}
          hasResults={!!result?.mechanics.length}
          loadingRec={loadingRec}
          busy={busy}
          onStart={() => { setScreen("location"); geo.detect(); }}
          onDetect={geo.detect}
          onManual={() => geo.setState("manual")}
          onConfirmLocation={() => setScreen("problem")}
          onContinue={loadRecommendations}
          onShowMechanics={() => setScreen("mechanics")}
          onRequestBest={() => best && setConfirm(best)}
          onCancel={() => setCancelOpen(true)}
          onConfirmPayment={() => request && run(() => api.confirmPayment(request.id))}
          onReceipt={() => setReceipt(true)}
          onDone={restart}
        />

        <ConfirmSheet rec={confirm} service={result?.diagnosis.service ?? ""} place={point?.label ?? ""} sending={sending} onClose={() => setConfirm(null)} onSend={sendRequest} />
        <ReceiptSheet open={receipt} request={request} onClose={() => setReceipt(false)} />
        <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancelRequest} />
        {toast.node}
      </div>
    </div>
  );
}
