"use client";

import MechanicDashboard from "@/components/mechanic/MechanicDashboard";
import { RoleGate } from "@/components/RoleGate";

export default function MechanicPage() {
  return <RoleGate role="mechanic" next="/mechanic">{(s, signOut) => <MechanicDashboard session={s} signOut={signOut} />}</RoleGate>;
}
