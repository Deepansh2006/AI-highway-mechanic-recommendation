import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-main page-narrow" style={{ ["--narrow" as string]: "520px", paddingTop: 64 }}>
      <div className="card card-pad stack g12">
        <h1 className="h2">Page not found</h1>
        <p className="muted">Need roadside help? Start from the Driver Portal.</p>
        <Link className="btn btn-primary btn-lg" href="/driver">Go to the Driver Portal</Link>
        <Link className="btn" href="/sos">Emergency SOS</Link>
      </div>
    </main>
  );
}
