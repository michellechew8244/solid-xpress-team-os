"use client";

import { useState, useTransition } from "react";
import { setUserFeatureAccess } from "@/app/(app)/users/feature-access-actions";

export interface FeatureRow {
  key: string;
  label: string;
  icon: string;
  /** What the user's role gives by default. */
  roleDefault: boolean;
  /** Current override, if any. */
  override: "ALLOW" | "DENY" | null;
  /** ALLOW can't open this beyond the role (page logic is role-bound). */
  denyOnly: boolean;
}

type Access = "DEFAULT" | "ALLOW" | "DENY";

export function FeatureAccessPanel({ userId, rows }: { userId: string; rows: FeatureRow[] }) {
  const [state, setState] = useState<Record<string, Access>>(
    Object.fromEntries(rows.map((r) => [r.key, (r.override ?? "DEFAULT") as Access])),
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = rows.some((r) => (r.override ?? "DEFAULT") !== state[r.key]);

  function effective(r: FeatureRow): boolean {
    const v = state[r.key];
    if (v === "DENY") return false;
    if (v === "ALLOW") return r.denyOnly ? r.roleDefault : true;
    return r.roleDefault;
  }

  function save() {
    setMsg(null);
    start(async () => {
      try {
        const entries = rows
          .filter((r) => (r.override ?? "DEFAULT") !== state[r.key])
          .map((r) => ({ featureKey: r.key, access: state[r.key] }));
        const res = await setUserFeatureAccess(userId, entries);
        setMsg({ ok: true, text: `Saved ✓ (${res.changed} change${res.changed === 1 ? "" : "s"})` });
      } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" }); }
    });
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
              <th className="px-2 py-2">Feature</th>
              <th className="px-2 py-2">Role default</th>
              <th className="px-2 py-2">Override</th>
              <th className="px-2 py-2">Effective</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const eff = effective(r);
              return (
                <tr key={r.key} className="border-b border-slate-50">
                  <td className="px-2 py-1.5 font-medium text-ink">{r.icon} {r.label}</td>
                  <td className="px-2 py-1.5 text-xs">{r.roleDefault ? <span className="text-ok">allowed</span> : <span className="text-ink-muted">not allowed</span>}</td>
                  <td className="px-2 py-1.5">
                    <select
                      className="input w-32 py-1 text-xs"
                      value={state[r.key]}
                      onChange={(e) => setState((s) => ({ ...s, [r.key]: e.target.value as Access }))}
                    >
                      <option value="DEFAULT">Default</option>
                      {!r.denyOnly && <option value="ALLOW">✅ Allow</option>}
                      <option value="DENY">🚫 Deny</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    {eff ? <span className="badge bg-green-100 text-green-700">Can use</span> : <span className="badge bg-rose-100 text-rose-700">Blocked</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary" disabled={pending || !dirty} onClick={save}>{pending ? "Saving…" : "Save feature access"}</button>
        {msg && <span className={msg.ok ? "text-xs text-ok" : "text-xs text-danger"}>{msg.text}</span>}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Default follows the user&apos;s role. Allow grants a feature beyond the role; Deny hides and blocks it.
        Changes apply to the sidebar and the pages themselves, and every change is audit-logged.
      </p>
    </div>
  );
}
