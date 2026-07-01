"use client";

import { useState, useTransition } from "react";
import {
  approveTask,
  rejectTask,
  setTaskStatus,
  submitForApproval,
  toggleChecklist,
  addComment,
} from "@/app/(app)/missions/actions";

export function WorkflowButtons({
  taskId,
  status,
  canApprove,
}: {
  taskId: string;
  status: string;
  canApprove: boolean;
}) {
  const [pending, start] = useTransition();
  const [proof, setProof] = useState("");
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const done = status === "COMPLETED";

  return (
    <div className="space-y-3">
      {!done && (
        <div className="flex flex-wrap gap-2">
          {status !== "IN_PROGRESS" && (
            <button className="btn-ghost" disabled={pending} onClick={() => start(() => setTaskStatus(taskId, "IN_PROGRESS"))}>▶ Start</button>
          )}
          <button className="btn-ghost" disabled={pending} onClick={() => start(() => setTaskStatus(taskId, "WAITING_EXTERNAL"))}>⏸ Waiting external</button>
        </div>
      )}

      {!done && (
        <div className="rounded-lg border border-slate-200 p-3">
          <label className="label">Proof of completion</label>
          <input className="input" placeholder="Link or note describing your proof" value={proof} onChange={(e) => setProof(e.target.value)} />
          <button className="btn-primary mt-2 w-full" disabled={pending} onClick={() => start(() => submitForApproval(taskId, proof))}>
            ✓ Submit for approval
          </button>
        </div>
      )}

      {canApprove && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-brand-700">Reviewer actions</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={pending} onClick={() => start(() => approveTask(taskId))}>✅ Approve & award diamonds</button>
            <button className="btn-danger" disabled={pending} onClick={() => setShowReject((s) => !s)}>↩ Reject</button>
          </div>
          {showReject && (
            <div className="mt-2">
              <input className="input" placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn-danger mt-2" disabled={pending} onClick={() => start(() => rejectTask(taskId, reason))}>Confirm rejection</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChecklistItem({ id, taskId, label, done }: { id: string; taskId: string; label: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 py-1 text-sm">
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        onChange={(e) => start(() => toggleChecklist(id, taskId, e.target.checked))}
        className="h-4 w-4 rounded border-slate-300"
      />
      <span className={done ? "text-ink-muted line-through" : ""}>{label}</span>
    </label>
  );
}

export function CommentBox({ taskId }: { taskId: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex gap-2">
      <input className="input" placeholder="Add a comment…" value={body} onChange={(e) => setBody(e.target.value)} />
      <button
        className="btn-primary"
        disabled={pending || !body.trim()}
        onClick={() => start(async () => { await addComment(taskId, body); setBody(""); })}
      >
        Send
      </button>
    </div>
  );
}
