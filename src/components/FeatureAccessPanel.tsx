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
  override: "ALLOW" | "DENY" | "PARTIAL" | null;
  /** ALLOW can't open this beyond the role (page logic is role-bound). */
  denyOnly: boolean;
  /** Feature supports PARTIAL access scoped to topic folders. */
  scopable: boolean;
  /** Currently scoped topic ids (when override is PARTIAL). */
  scopeTopicIds: string[];
}

export interface TopicOption { id: string; name: string; icon: string }

type Access = "DEFAULT" | "ALLOW" | "DENY" | "PARTIAL";

export function FeatureAccessPanel({ userId, rows, topics }: { userId: string; rows: FeatureRow[]; topics: TopicOption[] }) {
  const [state, setState] = useState<Record<string, Access>>(
    Object.fromEntries(rows.map((r) => [r.key, (r.override ?? "DEFAULT") as Access])),
  );
  const [scopes, setScopes] = useState<Record<string, string[]>>(
    Object.fromEntries(rows.map((r) => [r.key, r.scopeTopicIds])),
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const rowDirty = (r: FeatureRow) =>
    (r.override ?? "DEFAULT") !== state[r.key] ||
    (state[r.key] === "PARTIAL" && JSON.stringify([...r.scopeTopicIds].sort()) !== JSON.stringify([...(scopes[r.key] ?? [])].sort()));
  const dirty = rows.some(rowDirty);

  function effective(r: FeatureRow): "full" | "partial" | "blocked" {
    const v = state[r.key];
    if (v === "DENY") return "blocked";
    if (v === "PARTIAL") return (scopes[r.key]?.length ?? 0) > 0 ? "partial" : "blocked";
    if (v === "ALLOW") return r.denyOnly ? (r.roleDefault ? "full" : "blocked") : "full";
    return r.roleDefault ? "full" : "blocked";
  }

  function toggleTopic(key: string, topicId: string) {
    setScopes((s) => {
      const cur = s[key] ?? [];
      return { ...s, [key]: cur.includes(topicId) ? cur.filter((t) => t !== topicId) : [...cur, topicId] };
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      try {
        const entries = rows.filter(rowDirty).map((r) => ({
          featureKey: r.key,
          access: state[r.key],
          topicIds: state[r.key] === "PARTIAL" ? scopes[r.key] ?? [] : undefined,
        }));
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
              const partialOpen = r.scopable && state[r.key] === "PARTIAL";
              return (
                <FragmentRow key={r.key}>
                  <tr className="border-b border-slate-50">
                    <td className="px-2 py-1.5 font-medium text-ink">{r.icon} {r.label}</td>
                    <td className="px-2 py-1.5 text-xs">{r.roleDefault ? <span className="text-ok">allowed</span> : <span className="text-ink-muted">not allowed</span>}</td>
                    <td className="px-2 py-1.5">
                      <select
                        className="input w-36 py-1 text-xs"
                        value={state[r.key]}
                        onChange={(e) => setState((s) => ({ ...s, [r.key]: e.target.value as Access }))}
                      >
                        <option value="DEFAULT">Default</option>
                        {!r.denyOnly && <option value="ALLOW">✅ Full access</option>}
                        {r.scopable && <option value="PARTIAL">🔒 Partial access</option>}
                        <option value="DENY">🚫 No access</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      {eff === "full" && <span className="badge bg-green-100 text-green-700">Can use</span>}
                      {eff === "partial" && <span className="badge bg-amber-100 text-amber-700">Partial ({scopes[r.key]?.length ?? 0})</span>}
                      {eff === "blocked" && <span className="badge bg-rose-100 text-rose-700">Blocked</span>}
                    </td>
                  </tr>
                  {partialOpen && (
                    <tr className="border-b border-slate-50 bg-amber-50/40">
                      <td colSpan={4} className="px-4 py-2">
                        <div className="text-[11px] font-semibold text-ink-muted">Allowed topic folders — tick what they may see:</div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          {topics.length === 0 && <span className="text-xs text-ink-muted">No topic folders exist yet.</span>}
                          {topics.map((t) => (
                            <label key={t.id} className="flex items-center gap-1.5 text-xs text-ink">
                              <input
                                type="checkbox"
                                checked={(scopes[r.key] ?? []).includes(t.id)}
                                onChange={() => toggleTopic(r.key, t.id)}
                              />
                              {t.icon} {t.name}
                            </label>
                          ))}
                        </div>
                        {(scopes[r.key]?.length ?? 0) === 0 && <div className="mt-1 text-[11px] text-amber-700">Pick at least one folder, or this works like No access.</div>}
                      </td>
                    </tr>
                  )}
                </FragmentRow>
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
        Default follows the user&apos;s role. Full access grants a feature beyond the role; Partial limits it to
        the ticked topic folders (Training Centre); No access hides and blocks it. Changes apply to the sidebar
        and the pages themselves, and every change is audit-logged.
      </p>
    </div>
  );
}

/** Plain fragment wrapper so a row + its expanded scope row can share a key. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
