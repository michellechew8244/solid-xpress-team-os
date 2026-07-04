"use client";

import { useState, useTransition } from "react";
import { updateRewardRules } from "@/app/(app)/settings/reward-rules/actions";

interface Rules {
  streakEnabled: boolean; streakDay3: number; streakDay7: number; streakDay14: number; streakDay30: number;
  dailySpinEnabled: boolean; spinPrizeCommon: number; spinPrizeUncommon: number; spinPrizeRare: number; spinPrizeJackpot: number;
  proposalAcceptedReward: number; proposalImplementedReward: number;
}

export function RewardRulesForm({ rules }: { rules: Rules }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      action={(fd) => { setErr(null); setSaved(false); start(async () => { try { await updateRewardRules(fd); setSaved(true); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}
      className="space-y-6"
    >
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-bold text-ink">🔥 Check-in Streak Bonuses</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="streakEnabled" defaultChecked={rules.streakEnabled} /> Enabled</label>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className="label">3-day (💎)</label><input name="streakDay3" type="number" min={0} defaultValue={rules.streakDay3} className="input" /></div>
          <div><label className="label">7-day (💎)</label><input name="streakDay7" type="number" min={0} defaultValue={rules.streakDay7} className="input" /></div>
          <div><label className="label">14-day (💎)</label><input name="streakDay14" type="number" min={0} defaultValue={rules.streakDay14} className="input" /></div>
          <div><label className="label">30-day (💎)</label><input name="streakDay30" type="number" min={0} defaultValue={rules.streakDay30} className="input" /></div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-bold text-ink">🎡 Daily Check-in Spin</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="dailySpinEnabled" defaultChecked={rules.dailySpinEnabled} /> Enabled</label>
        </div>
        <p className="mb-2 text-xs text-ink-muted">Prize tiers (fixed odds: Common 50% · Uncommon 30% · Rare 15% · Jackpot 5%).</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className="label">Common (💎)</label><input name="spinPrizeCommon" type="number" min={0} defaultValue={rules.spinPrizeCommon} className="input" /></div>
          <div><label className="label">Uncommon (💎)</label><input name="spinPrizeUncommon" type="number" min={0} defaultValue={rules.spinPrizeUncommon} className="input" /></div>
          <div><label className="label">Rare (💎)</label><input name="spinPrizeRare" type="number" min={0} defaultValue={rules.spinPrizeRare} className="input" /></div>
          <div><label className="label">Jackpot (💎)</label><input name="spinPrizeJackpot" type="number" min={0} defaultValue={rules.spinPrizeJackpot} className="input" /></div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-bold text-ink">💡 Proposal (Idea Bank) default rewards</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Accepted — base reward (💎)</label><input name="proposalAcceptedReward" type="number" min={0} defaultValue={rules.proposalAcceptedReward} className="input" /></div>
          <div><label className="label">Implemented — extra reward (💎)</label><input name="proposalImplementedReward" type="number" min={0} defaultValue={rules.proposalImplementedReward} className="input" /></div>
        </div>
        <p className="mt-1 text-xs text-ink-muted">The base scales by category/impact as a suggested amount; the Boss can still override at approval time.</p>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save reward rules"}</button>
        {saved && <span className="text-xs text-ok">Saved ✓</span>}
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </form>
  );
}
