"use client";

import ControlRoom from "@/components/admin/ControlRoom";
import { RoleGate } from "@/components/RoleGate";

export default function AdminPage() {
  return <RoleGate role="admin" next="/admin">{(s, signOut) => <ControlRoom session={s} signOut={signOut} />}</RoleGate>;
}
