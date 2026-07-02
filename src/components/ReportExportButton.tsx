"use client";

import { useTransition } from "react";
import { exportMonthlyReportCsv } from "@/app/(app)/reports/actions";

export function ReportExportButton({ period }: { period: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-primary"
      disabled={pending}
      onClick={() => start(async () => {
        const csv = await exportMonthlyReportCsv(period);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `performance-report-${period}.csv`;
        a.click(); URL.revokeObjectURL(url);
      })}
    >
      {pending ? "Exporting…" : "⬇ Export CSV"}
    </button>
  );
}
