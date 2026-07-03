"use client";

import { useTransition } from "react";
import { useState } from "react";
import { approveSignup, rejectSignup } from "@/app/(app)/users/signup-approval-actions";
import { Avatar } from "@/components/ui";

export interface PendingSignup {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  avatarColor: string;
  departmentName: string | null;
  nationalId: string | null;
  dobLabel: string | null;
  requestedLabel: string;
}

export function SignupApprovalPanel({ pending }: { pending: PendingSignup[] }) {
  if (pending.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border-l-4 border-l-warn bg-amber-50/40 p-4">
      <div className="mb-3 text-sm font-bold text-ink">🆕 Sign-ups awaiting approval ({pending.length})</div>
      <div className="space-y-2">
        {pending.map((p) => <Row key={p.id} p={p} />)}
      </div>
    </div>
  );
}

function Row({ p }: { p: PendingSignup }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => { setErr(null); start(async () => { try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3">
      <div className="flex min-w-0 items-center gap-3">
        {p.avatarUrl
          ? <img src={p.avatarUrl} alt={p.name} className="h-10 w-10 rounded-full object-cover" />
          : <Avatar name={p.name} color={p.avatarColor} size={40} />}
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-ink">{p.name}</div>
          <div className="text-xs text-ink-muted">
            {p.email}{p.departmentName ? ` · ${p.departmentName}` : ""}
            {p.dobLabel ? ` · DOB ${p.dobLabel}` : ""}{p.nationalId ? ` · ID ${p.nationalId}` : ""}
          </div>
          <div className="text-[10px] text-ink-muted">Requested {p.requestedLabel}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => run(() => approveSignup(p.id))}>✅ Approve</button>
        <button className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending} onClick={() => { const r = window.prompt("Reason for rejecting this sign-up?") ?? ""; run(() => rejectSignup(p.id, r)); }}>Reject</button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </div>
  );
}
