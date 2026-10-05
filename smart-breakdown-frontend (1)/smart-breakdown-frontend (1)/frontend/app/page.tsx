"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HOME_FOR_ROLE, useSession } from "@/lib/hooks";

/** Entry point: signed-in users go to their dashboard, everyone else to sign in. */
export default function Home() {
  const router = useRouter();
  const { session, ready } = useSession();
  useEffect(() => {
    if (ready) router.replace(session ? HOME_FOR_ROLE[session.role] : "/login");
  }, [ready, session, router]);
  return <div className="page" aria-busy="true" />;
}
