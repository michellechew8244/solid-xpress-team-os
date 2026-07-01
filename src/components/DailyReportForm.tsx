"use client";

import { useRef, useState } from "react";
import { submitDailyReport } from "@/app/(app)/daily-report/actions";

function Scale({ name, label }: { name: string; label: string }) {
  const [val, setVal] = useState(3);
  return (
    <div>
      <label className="label">{label}: {val}/5</label>
      <input type="range" name={name} min={1} max={5} value={val} onChange={(e) => setVal(Number(e.target.value))} className="w-full accent-brand-600" />
    </div>
  );
}

export function DailyReportForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [done, setDone] = useState(false);

  return (
    <form
      ref={ref}
      action={async (fd) => { await submitDailyReport(fd); ref.current?.reset(); setDone(true); setTimeout(() => setDone(false), 3000); }}
      className="space-y-4"
    >
      <div>
        <label className="label">✅ What did you complete today?</label>
        <textarea name="completed" className="input" rows={2} required />
      </div>
      <div>
        <label className="label">⏳ What is still pending?</label>
        <textarea name="pending" className="input" rows={2} />
      </div>
      <div>
        <label className="label">🆘 What problem do you need help with?</label>
        <textarea name="needHelp" className="input" rows={2} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">👤 Which customer / job needs attention?</label>
          <input name="customerFocus" className="input" />
        </div>
        <div>
          <label className="label">🎯 Tomorrow's top 3 priorities</label>
          <textarea name="priorities" className="input" rows={1} placeholder="1. … 2. … 3. …" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Scale name="energyLevel" label="⚡ Energy level" />
        <Scale name="confidenceLevel" label="💪 Confidence level" />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" type="submit">Submit Daily Report</button>
        {done && <span className="text-sm font-semibold text-ok">✓ Submitted, thank you!</span>}
      </div>
    </form>
  );
}
