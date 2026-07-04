"use client";

import { useState, useTransition } from "react";
import { redeemReward, decideRedemption } from "@/app/(app)/rewards/actions";

export function RedeemButton({
  rewardId,
  cost,
  balance,
  blockedReason,
}: {
  rewardId: string;
  cost: number;
  balance: number;
  blockedReason?: string | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const affordable = balance >= cost;
  const blocked = !!blockedReason;

  return (
    <div>
      <button
        className={affordable && !blocked ? "btn-primary w-full" : "btn-ghost w-full"}
        disabled={pending || !affordable || blocked || msg?.ok}
        title={blockedReason ?? undefined}
        onClick={() =>
          start(async () => {
            try {
              const res = await redeemReward(rewardId);
              if (res.ok) setMsg({ ok: true, text: "Requested ✓ — waiting for HR/Management approval. You'll get a notification." });
              else setMsg({ ok: false, text: res.error });
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong — please try again." });
            }
          })
        }
      >
        {pending ? "…" : msg?.ok ? "✓ Requested" : blocked ? "🔒 Leave blocked" : affordable ? `Redeem for ${cost.toLocaleString()} 💎` : "Not enough diamonds"}
      </button>
      {blockedReason && <div className="mt-1 text-center text-xs text-amber-600">{blockedReason}</div>}
      {msg && <div className={`mt-1 text-center text-xs ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</div>}
    </div>
  );
}

export function RedemptionDecision({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => start(() => decideRedemption(id, true))}>Approve</button>
      <button className="btn-danger px-3 py-1 text-xs" disabled={pending} onClick={() => start(() => decideRedemption(id, false))}>Reject</button>
    </div>
  );
}
