"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui";
import { approveLevelUpgradeAction, rejectLevelUpgradeAction } from "@/app/(app)/badges/growth-actions";

export interface PendingUpgradeVM {
  id: string;
  userName: string;
  avatarColor: string;
  fromLevel: number;
  toLevel: number;
  toLevelName: string;
}

/**
 * Approve/Reject panel for pending level-upgrade requests. Not one of the 10
 * named components in the spec, but required to make Section 9's approval
 * flow ("Approve Upgrade" / "Reject Upgrade" buttons) actually functional.
 */
export function LevelUpgradeApprovalPanel({ requests }: { requests: PendingUpgradeVM[] }) {
  if (requests.length === 0) return null;
  return (
    <div className="space-y-2">
      {requests.map((r) => <ApprovalRow key={r.id} request={r} />)}
    </div>
  );
}

function ApprovalRow({ request }: { request: PendingUpgradeVM }) {
  const [pending, start] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="rounded-lg bg-amber-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Avatar name={request.userName} color={request.avatarColor} size={26} />
          <span><strong>{request.userName}</strong> requests Lv.{request.fromLevel} → Lv.{request.toLevel} ({request.toLevelName})</span>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-primary px-3 py-1 text-xs" disabled={pending}
            onClick={() => start(async () => { setErr(null); try { await approveLevelUpgradeAction(request.id); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          >
            Approve Upgrade
          </button>
          <button className="btn-danger px-3 py-1 text-xs" onClick={() => setShowReject((o) => !o)}>Reject Upgrade</button>
        </div>
      </div>
      {showReject && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="input flex-1" placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button
            className="btn-ghost px-3 py-1 text-xs" disabled={pending}
            onClick={() => start(async () => { setErr(null); try { await rejectLevelUpgradeAction(request.id, reason); setShowReject(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          >
            Confirm Reject
          </button>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}
