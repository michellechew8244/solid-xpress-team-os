"use client";

import { useTransition } from "react";
import { LEAVE_BLOCK_SETTINGS } from "@/lib/enums";
import { toggleLeaveBlock } from "@/app/(app)/points-admin/actions";

export function LeaveBlockToggles({ enabled }: { enabled: Record<string, boolean> }) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      {LEAVE_BLOCK_SETTINGS.map((s) => {
        const on = enabled[s.key] ?? false;
        return (
          <label key={s.key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-sm text-ink-soft">{s.label}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => toggleLeaveBlock(s.key, s.label, !on))}
              className={`relative h-6 w-11 rounded-full transition ${on ? "bg-danger" : "bg-slate-300"}`}
              aria-pressed={on}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </label>
        );
      })}
      <p className="text-xs text-ink-muted">When any toggle is ON, staff cannot redeem leave rewards.</p>
    </div>
  );
}
