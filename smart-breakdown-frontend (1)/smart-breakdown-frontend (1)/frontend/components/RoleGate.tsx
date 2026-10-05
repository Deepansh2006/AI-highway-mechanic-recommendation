"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "@/lib/hooks";
import type { Role, Session } from "@/lib/types";
import { TopBar } from "./ui";

/** Shows children only for a signed-in user with the given role. */
export function RoleGate({ role, next, children }: { role: Role; next: string; children: (s: Session, signOut: () => void) => ReactNode }) {
  const { session, ready, setSession } = useSession();
  if (!ready) return <div className="page" aria-busy="true" />;
  if (!session || session.role !== role) {
    const who = role === "mechanic" ? "mechanic" : "control room";
    return (
      <div className="page">
        <TopBar />
        <main className="page-main page-narrow" style={{ ["--narrow" as string]: "520px", paddingTop: 48 }}>
          <div className="card card-pad stack g12">
            <h1 className="h2">Sign in to continue</h1>
            <p className="muted">This page is for {who} accounts. Sign in with your registered {role === "mechanic" ? "mobile number" : "work email"}.</p>
            <Link className="btn btn-primary btn-lg" href={`/login?role=${role}&next=${encodeURIComponent(next)}`}>Sign in</Link>
            <Link className="btn" href="/driver">Need roadside help? Go to the Driver Portal</Link>
          </div>
        </main>
      </div>
    );
  }
  return <>{children(session, () => setSession(null))}</>;
}
