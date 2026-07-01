"use client";

import { useState, useTransition } from "react";
import { requestLevelUpgrade } from "@/app/(app)/badges/growth-actions";
import { LevelCelebrationModal } from "./LevelCelebrationModal";

export function ClaimLevelUpgradeButton({ nextLevel, nextLevelName }: { nextLevel: number; nextLevelName: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  return (
    <div>
      <button
        className="btn-primary w-full sm:w-auto"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            setMsg(null);
            try {
              const result = await requestLevelUpgrade();
              if (result.autoApproved) setCelebrate(true);
              else setMsg("Your level upgrade request has been submitted for approval.");
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Error");
            }
          })
        }
      >
        {pending ? "Submitting…" : "🚀 Claim Level Upgrade"}
      </button>
      {msg && <p className="mt-2 text-sm font-medium text-brand-700">{msg}</p>}
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      <LevelCelebrationModal open={celebrate} levelNumber={nextLevel} levelName={nextLevelName} onClose={() => setCelebrate(false)} />
    </div>
  );
}
