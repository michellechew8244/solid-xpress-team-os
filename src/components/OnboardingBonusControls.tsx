"use client";

import { useState, useTransition } from "react";
import { awardOnboardingBonusManual, reverseOnboardingBonus } from "@/app/(app)/users/actions";

/**
 * Onboarding-bonus management for a single staff member (User detail page).
 * - Award: Boss always; HR Admin when allowed by the timing setting.
 * - Reverse: Owner / Boss only, when a bonus was wrongly issued.
 */
export function OnboardingBonusControls({
  userId,
  issued,
  amount,
  canAward,
  canReverse,
}: {
  userId: string;
  issued: boolean;
  amount: number;
  canAward: boolean;
  canReverse: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function run(fn: () => Promise<void>, okText: string) {
    setMsg(null);
    start(async () => {
      try { await fn(); setMsg({ kind: "ok", text: okText }); }
      catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : "Error" }); }
    });
  }

  return (
    <div className="space-y-2 text-sm">
      <div>
        Status:{" "}
        {issued
          ? <strong className="text-ok">Issued ({amount} 💎)</strong>
          : <strong className="text-ink-muted">Not issued</strong>}
      </div>

      <div className="flex flex-wrap gap-2">
        {!issued && canAward && (
          <button
            className="btn-primary px-3 py-1 text-xs"
            disabled={pending}
            onClick={() => run(() => awardOnboardingBonusManual(userId), "Onboarding bonus awarded 🎉")}
          >
            🎁 Award onboarding bonus
          </button>
        )}
        {issued && canReverse && (
          <button
            className="btn-ghost px-3 py-1 text-xs text-danger"
            disabled={pending}
            onClick={() => run(() => reverseOnboardingBonus(userId), "Onboarding bonus reversed")}
          >
            ↩ Reverse bonus
          </button>
        )}
      </div>

      {msg && <div className={msg.kind === "ok" ? "text-xs text-ok" : "text-xs text-danger"}>{msg.text}</div>}
      {issued && !canReverse && <p className="text-xs text-ink-muted">Already received the welcome bonus. Duplicate grants are blocked.</p>}
    </div>
  );
}
