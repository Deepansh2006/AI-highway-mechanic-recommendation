"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { clock, issueLabel, priceRange, rupees } from "@/lib/labels";
import type { PastRequest, ServiceRequest } from "@/lib/types";
import { Icon } from "../Icon";
import { Avatar, LangButton, Sheet, SosLink, Spinner, tintFor, TopBar, useToast } from "../ui";

const WENT_WELL = ["Arrived quickly", "Fair price", "Polite", "Fixed it properly", "Explained the problem", "Felt safe"];
const WENT_WRONG = ["Arrived late", "Charged more than quoted", "Rude behaviour", "Repair didn't hold", "Didn't explain the work", "Felt unsafe"];
const WORDS = ["", "Poor", "Not great", "Okay", "Good", "Excellent"];
const REPORTS = ["Overcharged", "Mechanic didn't arrive", "Work not done properly", "Unsafe behaviour", "Something else"];

export default function FeedbackPage() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [req, setReq] = useState<ServiceRequest | null>(null);
  const [past, setPast] = useState<PastRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [priceMatched, setPriceMatched] = useState<boolean | null>(null);
  const [charged, setCharged] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const requestId = params.get("request");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setSubmitted(false);
      setRating(0);
      setTags([]);
      setPriceMatched(null);
      setCharged("");
      setComment("");
      try {
        const list = await api.pastRequests();
        if (!alive) return;
        setPast(list);
        const id = requestId ?? list.find((p) => p.rated == null)?.id ?? list[0]?.id;
        if (id) setReq(await api.getRequest(id));
        else setNotFound(true);
      } catch {
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [requestId]);

  const positive = rating >= 4;
  const tagList = rating === 0 ? [] : positive ? WENT_WELL : WENT_WRONG;
  const alreadyRated = past.find((p) => p.id === req?.id)?.rated ?? null;

  const submit = async () => {
    if (!req || !rating) return;
    setSubmitting(true);
    try {
      await api.submitFeedback({
        request_id: req.id, rating, tags: tags.filter((t) => tagList.includes(t)), price_matched: priceMatched,
        charged_amount: priceMatched === false && charged ? Number(charged) : null, comment: comment.trim(),
      });
      setSubmitted(true);
      setPast(await api.pastRequests());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't send your feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));

  return (
    <div className="page">
      <TopBar><LangButton /><SosLink /></TopBar>
      <main className="page-main page-narrow">
        {loading && <div className="skeleton" style={{ height: 420, borderRadius: 20 }} aria-busy="true" />}
        {!loading && notFound && (
          <div className="card card-pad stack g10">
            <h1 className="h2">No completed request found</h1>
            <p className="muted">Feedback opens after a repair is completed.</p>
            <Link href="/driver" className="btn btn-primary btn-lg">Go to the Driver Portal</Link>
          </div>
        )}

        {!loading && req && submitted && (
          <section className="card stack center g14" style={{ padding: "40px 24px", alignItems: "center" }} role="status">
            <span style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--green-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="check" size={36} stroke="var(--green)" width={2.6} />
            </span>
            <h1 className="h1">Thanks, your feedback is in</h1>
            <p className="muted" style={{ maxWidth: 440 }}>It shapes which mechanics we recommend to the next stranded driver{req.location?.label ? " on this highway" : ""}. Drive safe.</p>
            <div className="row wrap g10" style={{ justifyContent: "center" }}>
              <Link href="/driver" className="btn btn-primary btn-lg">Back to Driver Portal</Link>
              <button type="button" className="btn btn-lg" onClick={() => setSubmitted(false)}>Edit feedback</button>
            </div>
          </section>
        )}

        {!loading && req && !submitted && (
          <form className="card stack g24" style={{ padding: "26px 22px", borderRadius: 22 }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div className="stack g6">
              <h1 className="h1">How was your help today?</h1>
              <p className="muted">Your rating helps us recommend the right mechanic to the next stranded driver.</p>
              {alreadyRated && <p className="note small">You rated this job {alreadyRated}★ earlier. Sending again updates it.</p>}
            </div>

            <section aria-label="Job summary" className="soft stack g12" style={{ padding: 16, borderRadius: 16 }}>
              <div className="row g12">
                <Avatar initials={req.mechanic_initials ?? "?"} size={52} tint={tintFor(req.mechanic_initials)} label={`Photo of ${req.mechanic_owner}`} />
                <div className="stack grow"><b style={{ fontSize: 17 }}>{req.mechanic_name}</b><span className="small muted">{req.mechanic_owner} · Verified</span></div>
                <b className="num" style={{ fontSize: 24 }}>{rupees(req.final_amount ?? 0)}</b>
              </div>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                <Fact k="Service" v={req.line_items[0]?.label ?? issueLabel(req.issue)} />
                <Fact k="Request" v={req.id} />
                <Fact k="Arrival time" v={req.arrived_at ? `${Math.max(1, Math.round((req.arrived_at - req.created_at) / 60000))} min after request` : "—"} />
                <Fact k="Completed" v={req.completed_at ? clock(req.completed_at) : "—"} />
              </dl>
            </section>

            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack g12">
              <legend className="label" style={{ marginBottom: 12, fontSize: 15 }}>Overall rating</legend>
              <div role="radiogroup" aria-label="Rating out of 5" className="row wrap g8">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""} — ${WORDS[n]}`}
                    onClick={() => setRating(n)}
                    style={{ width: 56, height: 56, borderRadius: 14, border: `2px solid ${n <= rating ? "var(--amber)" : "var(--line)"}`, background: n <= rating ? "var(--amber-tint)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                    <Icon name="star" size={30} fill={n <= rating ? "#E39A0E" : "none"} stroke={n <= rating ? "#E39A0E" : "#9AA3AF"} width={1.6} />
                  </button>
                ))}
                <span className="bold" style={{ fontSize: 17, marginLeft: 8 }} aria-live="polite">{rating ? WORDS[rating] : "Tap a star"}</span>
              </div>
            </fieldset>

            {rating > 0 && (
              <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack g12">
                <legend className="label" style={{ marginBottom: 12, fontSize: 15 }}>{positive ? "What went well?" : "What went wrong?"}</legend>
                <div className="row wrap g8">
                  {tagList.map((t) => <button key={t} type="button" className="pill" aria-pressed={tags.includes(t)} onClick={() => toggle(t)}>{t}</button>)}
                </div>
                {!positive && tags.includes("Felt unsafe") && (
                  <p className="note" style={{ background: "var(--red-tint)", color: "var(--red-ink)" }}>
                    If you&apos;re in danger right now, use <Link href="/sos" className="bold" style={{ color: "var(--red-ink)" }}>Emergency SOS</Link>. Unsafe behaviour reports are reviewed by the control room first.
                  </p>
                )}
              </fieldset>
            )}

            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack g12">
              <legend className="label" style={{ marginBottom: 12, fontSize: 15 }}>Did the final price match the quote ({priceRange(req.price_min, req.price_max)})?</legend>
              <div role="radiogroup" className="row wrap g8">
                <button type="button" role="radio" aria-checked={priceMatched === true} className="tile" style={{ minHeight: 48 }} onClick={() => setPriceMatched(true)}>Yes, it matched</button>
                <button type="button" role="radio" aria-checked={priceMatched === false} className="tile" style={{ minHeight: 48 }} onClick={() => setPriceMatched(false)}>No, I paid more</button>
              </div>
              {priceMatched === false && (
                <div className="field" style={{ maxWidth: 260 }}>
                  <label htmlFor="charged" className="label">How much did you pay?</label>
                  <div className="input-group" style={{ height: 50, border: "1px solid var(--line-2)" }}>
                    <span>₹</span>
                    <input id="charged" inputMode="numeric" value={charged} onChange={(e) => setCharged(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                  </div>
                </div>
              )}
            </fieldset>

            <div className="field">
              <label htmlFor="comment" className="label">Anything else? <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></label>
              <textarea id="comment" className="input" rows={4} maxLength={600} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell us what happened, in Hindi or English" />
            </div>

            <div className="row wrap g12">
              <button type="submit" className="btn btn-primary btn-lg" style={{ padding: "0 32px" }} disabled={!rating || submitting}>{submitting ? <Spinner /> : "Submit feedback"}</button>
              {!rating && <span className="small muted">Choose a rating to submit</span>}
            </div>
            <button type="button" className="underline-btn" style={{ alignSelf: "flex-start", minHeight: 40 }} onClick={() => setReportOpen(true)}>Report a problem with this job</button>
          </form>
        )}

        {!loading && past.length > 0 && (
          <section aria-labelledby="past-h" className="card card-pad stack g4">
            <h2 id="past-h" className="h3" style={{ marginBottom: 6 }}>Your past requests</h2>
            {past.map((p) => (
              <div key={p.id} className="list-row" style={{ background: p.id === req?.id ? "var(--soft)" : undefined, padding: "12px 8px", borderRadius: 8 }}>
                <div className="stack grow"><b>{p.issue_label}</b><span className="small muted">{p.mechanic_name} · {p.date} · {p.id}</span></div>
                {p.rated ? <span className="bold small">★ {p.rated}</span>
                  : p.id === req?.id ? <span className="small muted">Rating now</span>
                  : <button type="button" className="btn btn-sm" onClick={() => router.push(`/feedback?request=${p.id}`)}>Rate now</button>}
              </div>
            ))}
          </section>
        )}
      </main>

      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)}
        onSend={async (cat, details) => {
          if (!req) return;
          await api.reportProblem(req.id, cat, details);
          setReportOpen(false);
          toast.show("Report sent to the control room. We'll contact you within 24 hours.");
        }} />
      {toast.node}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return <div className="stack"><dt className="small muted">{k}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{v}</dd></div>;
}

function ReportSheet({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (cat: string, details: string) => Promise<void> }) {
  const [cat, setCat] = useState(REPORTS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} labelledBy="rep-h" centered>
      <h2 id="rep-h" className="h2">Report a problem</h2>
      <p className="small muted">Reports go straight to the control room and are reviewed within 24 hours.</p>
      <div role="radiogroup" aria-label="Problem" className="stack g8">
        {REPORTS.map((r) => <button key={r} type="button" role="radio" aria-checked={cat === r} className="tile" style={{ minHeight: 48 }} onClick={() => setCat(r)}>{r}</button>)}
      </div>
      {cat === "Unsafe behaviour" && <p className="note" style={{ background: "var(--red-tint)", color: "var(--red-ink)" }}>In danger right now? Use <Link href="/sos" className="bold" style={{ color: "var(--red-ink)" }}>Emergency SOS</Link> or call 112.</p>}
      <label htmlFor="rep-d" className="label">What happened?</label>
      <textarea id="rep-d" className="input" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
      <div className="grid2" style={{ gap: 10 }}>
        <button type="button" className="btn btn-lg" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-dark btn-lg" disabled={busy} onClick={async () => { setBusy(true); try { await onSend(cat, details); setDetails(""); } finally { setBusy(false); } }}>{busy ? <Spinner /> : "Send report"}</button>
      </div>
    </Sheet>
  );
}
