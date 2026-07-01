"use client";

import { useTransition } from "react";
import { generateReviews } from "@/app/(app)/reviews/actions";

export function GenerateReviewsButton() {
  const [pending, start] = useTransition();
  return (
    <button className="btn-primary" disabled={pending} onClick={() => start(() => generateReviews())}>
      {pending ? "Calculating…" : "⚙️ Generate Reviews"}
    </button>
  );
}
