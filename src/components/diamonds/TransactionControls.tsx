"use client";

import { useState, useTransition } from "react";
import { reverseTxn, voidTxn, exportDiamondCsv } from "@/app/(app)/diamonds/transactions/actions";
import type { TxnFilter } from "@/lib/diamonds";

export function RowActions({ txId, status }: { txId: string; status: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const done = status === "REVERSED" || status === "VOIDED";
  if (done) return <span className="text-xs text-ink-muted">{status}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      <button className="btn-ghost px-2 py-0.5 text-xs" disabled={pending} onClick={() => start(async () => { try { await reverseTxn(txId); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}>Reverse</button>
      <button className="btn-ghost px-2 py-0.5 text-xs text-danger" disabled={pending} onClick={() => start(async () => { try { await voidTxn(txId); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}>Void</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}

export function ExportButton({ filter }: { filter: TxnFilter }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-ghost px-3 py-1 text-xs"
      disabled={pending}
      onClick={() => start(async () => {
        const csv = await exportDiamondCsv(filter);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `diamond-report-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
      })}
    >
      {pending ? "Exporting…" : "⬇ Export CSV"}
    </button>
  );
}
