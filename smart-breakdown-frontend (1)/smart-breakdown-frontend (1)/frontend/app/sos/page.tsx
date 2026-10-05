import type { Metadata } from "next";
import SosPage from "@/components/sos/SosPage";

export const metadata: Metadata = { title: "Emergency SOS" };

export default function Page() {
  return <SosPage />;
}
