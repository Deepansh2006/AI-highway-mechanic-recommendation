import type { Metadata } from "next";
import { Suspense } from "react";
import LoginPage from "@/components/auth/LoginPage";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense fallback={<div className="page" />}>
      <LoginPage />
    </Suspense>
  );
}
