"use client";

import { useState, useTransition } from "react";
import { updateDiamondAuthoritySetting } from "@/app/(app)/settings/diamond-authority/actions";
import { grantDiamondAuthority } from "@/app/(app)/owner/diamonds/actions";

interface Setting {
  allowHrPropose: boolean; allowDeptHeadPropose: boolean; requireOwnerApproval: boolean;
  maxHrProposal: number; maxDeptHeadProposal: number; monthlyBudgetLimit: number; alertOnExceed: boolean;
}

export function DiamondAuthorityForm({ setting }: { setting: Setting }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      action={(fd) => { setErr(null); setSaved(false); start(async () => { try { await updateDiamondAuthoritySetting(fd); setSaved(true); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="allowHrPropose" defaultChecked={setting.allowHrPropose} /> Allow HR to propose diamond bonus</label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="allowDeptHeadPropose" defaultChecked={setting.allowDeptHeadPropose} /> Allow Department Head to propose diamond bonus</label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="requireOwnerApproval" defaultChecked={setting.requireOwnerApproval} /> Require Owner approval for all non-owner diamond generation</label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="alertOnExceed" defaultChecked={setting.alertOnExceed} /> Alert Owner when monthly diamond generation exceeds the limit</label>
      <div><label className="label">Max HR proposal amount</label><input name="maxHrProposal" type="number" min={0} defaultValue={setting.maxHrProposal} className="input" /></div>
      <div><label className="label">Max Department Head proposal amount</label><input name="maxDeptHeadProposal" type="number" min={0} defaultValue={setting.maxDeptHeadProposal} className="input" /></div>
      <div><label className="label">Monthly diamond budget limit (0 = unlimited)</label><input name="monthlyBudgetLimit" type="number" min={0} defaultValue={setting.monthlyBudgetLimit} className="input" /></div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {saved && <span className="text-xs text-ok">Saved ✓</span>}
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </form>
  );
}

export function AuthorityToggle({ userId, granted }: { userId: string; granted: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(granted);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        className={`btn-ghost px-3 py-1 text-xs ${on ? "text-ok" : ""}`}
        disabled={pending}
        onClick={() => start(async () => { try { await grantDiamondAuthority(userId, !on); setOn(!on); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
      >
        {on ? "✓ Authority granted — click to revoke" : "Grant diamond authority"}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
