import type { Metadata } from "next";
import { Suspense } from "react";
import FeedbackPage from "@/components/feedback/FeedbackPage";

export const metadata: Metadata = { title: "Feedback" };

export default function Page() {
  return (
    <Suspense fallback={<div className="page" />}>
      <FeedbackPage />
    </Suspense>
  );
}
