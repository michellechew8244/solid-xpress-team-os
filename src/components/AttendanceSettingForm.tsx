"use client";

import { useState, useTransition } from "react";
import { updateAttendanceSetting } from "@/app/(app)/attendance/settings/actions";

const DAY_LABELS: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

export function AttendanceSettingForm({ setting }: { setting: Record<string, unknown> }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = setting as {
    standardStartTime: string; standardEndTime: string; gracePeriodMinutes: number; workingDaysJson: string;
    lunchBreakMinutes: number; overtimeEnabled: boolean; diamondRewardEnabled: boolean; onTimeDiamondReward: number;
    completeDayDiamondReward: number; weeklyStreakDiamondReward: number; monthlyPerfectAttendanceReward: number;
    lateDeductionEnabled: boolean; lateDeductionDiamond: number; missingCheckoutDeductionDiamond: number;
    locationRequired: boolean; photoRequired: boolean;
  };
  let workingDays: number[] = [1, 2, 3, 4, 5];
  try { workingDays = JSON.parse(s.workingDaysJson); } catch { /* default */ }

  return (
    <form
      action={(fd) => { setErr(null); setSaved(false); start(async () => { try { await updateAttendanceSetting(fd); setSaved(true); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <div><label className="label">Standard start time</label><input name="standardStartTime" type="time" defaultValue={s.standardStartTime} className="input" /></div>
      <div><label className="label">Standard end time</label><input name="standardEndTime" type="time" defaultValue={s.standardEndTime} className="input" /></div>
      <div><label className="label">Grace period (minutes)</label><input name="gracePeriodMinutes" type="number" min={0} defaultValue={s.gracePeriodMinutes} className="input" /></div>
      <div><label className="label">Lunch break (minutes)</label><input name="lunchBreakMinutes" type="number" min={0} defaultValue={s.lunchBreakMinutes} className="input" /></div>
      <div className="sm:col-span-2">
        <label className="label">Working days</label>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="flex items-center gap-1 text-sm"><input type="checkbox" name={`day${d}`} defaultChecked={workingDays.includes(d)} /> {DAY_LABELS[d]}</label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="overtimeEnabled" defaultChecked={s.overtimeEnabled} /> Overtime calculation enabled</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="diamondRewardEnabled" defaultChecked={s.diamondRewardEnabled} /> Attendance diamond rewards enabled</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="lateDeductionEnabled" defaultChecked={s.lateDeductionEnabled} /> Late / missing-checkout deductions enabled</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="photoRequired" defaultChecked={s.photoRequired} /> Photo proof required</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="locationRequired" defaultChecked={s.locationRequired} /> Location required (future)</label>

      <div><label className="label">On-time reward (💎)</label><input name="onTimeDiamondReward" type="number" min={0} defaultValue={s.onTimeDiamondReward} className="input" /></div>
      <div><label className="label">Complete-day reward (💎)</label><input name="completeDayDiamondReward" type="number" min={0} defaultValue={s.completeDayDiamondReward} className="input" /></div>
      <div><label className="label">5-day on-time streak reward (💎)</label><input name="weeklyStreakDiamondReward" type="number" min={0} defaultValue={s.weeklyStreakDiamondReward} className="input" /></div>
      <div><label className="label">Perfect month reward (💎)</label><input name="monthlyPerfectAttendanceReward" type="number" min={0} defaultValue={s.monthlyPerfectAttendanceReward} className="input" /></div>
      <div><label className="label">Late deduction (💎)</label><input name="lateDeductionDiamond" type="number" min={0} defaultValue={s.lateDeductionDiamond} className="input" /></div>
      <div><label className="label">Missing check-out deduction (💎)</label><input name="missingCheckoutDeductionDiamond" type="number" min={0} defaultValue={s.missingCheckoutDeductionDiamond} className="input" /></div>

      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
        {saved && <span className="text-xs text-ok">Saved ✓</span>}
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </form>
  );
}
