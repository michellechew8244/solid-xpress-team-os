"use client";

import { useState, useTransition } from "react";
import { updateOnboardingBonusSetting } from "@/app/(app)/points-admin/actions";

const TIMING_LABELS: Record<string, string> = {
  ON_USER_CREATION: "On user account creation",
  ON_ONBOARDING_COMPLETION: "On onboarding checklist completion",
  MANUAL_OWNER_APPROVAL: "Manual approval by Owner",
};

export function OnboardingBonusSettingForm({
  setting,
  canEdit,
}: {
  setting: { enabled: boolean; amount: number; timing: string };
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!canEdit) {
    // Read-only summary (HR Admin / others).
    return (
      <div className="space-y-1 text-sm">
        <div>Status: <strong className={setting.enabled ? "text-ok" : "text-danger"}>{setting.enabled ? "Enabled" : "Disabled"}</strong></div>
        <div>Bonus amount: <strong>{setting.amount} 💎</strong></div>
        <div>Award timing: <strong>{TIMING_LABELS[setting.timing] ?? setting.timing}</strong></div>
        <p className="pt-1 text-xs text-ink-muted">Only the Owner can change these settings.</p>
      </div>
    );
  }

  return (
    <form
      action={(fd) => { setErr(null); setSaved(false); start(async () => { try { await updateOnboardingBonusSetting(fd); setSaved(true); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}
      className="space-y-3"
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={setting.enabled} className="h-4 w-4" />
        <span>Enable onboarding diamond bonus</span>
      </label>

      <div>
        <label className="label">Onboarding bonus amount (💎)</label>
        <input name="amount" type="number" min={0} defaultValue={setting.amount} className="input w-40" />
      </div>

      <div>
        <label className="label">Award timing</label>
        <select name="timing" defaultValue={setting.timing} className="input w-full sm:w-72">
          {Object.entries(TIMING_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <p className="mt-1 text-xs text-ink-muted">“On onboarding checklist completion” takes effect once a checklist module is added; until then use account creation or manual approval.</p>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary px-4 py-1.5 text-sm" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {saved && <span className="text-xs text-ok">Saved ✓</span>}
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </form>
  );
}
