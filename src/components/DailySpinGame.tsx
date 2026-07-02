"use client";

import { useState, useTransition } from "react";
import { spinDailyWheel } from "@/app/(app)/attendance/actions";
import { SpinWheel, type WheelSegment } from "@/components/SpinWheel";
import { Confetti } from "@/components/Confetti";
import { SPIN_WHEEL_VALUES } from "@/lib/games";

const COLORS = ["#2f60f0", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#4d7c0f"];
const SEGMENTS: WheelSegment[] = SPIN_WHEEL_VALUES.map((v, i) => ({ key: String(i), label: `${v} 💎`, color: COLORS[i % COLORS.length] }));

export function DailySpinGame({ clockedIn, alreadySpun }: { clockedIn: boolean; alreadySpun: boolean }) {
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);
  const [prize, setPrize] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(alreadySpun);

  function spin() {
    setErr(null); setRevealed(false); setPrize(null);
    start(async () => {
      try {
        const r = await spinDailyWheel();
        setPrize(r.prize);
        setTarget(String(r.segmentIndex));
        setTimeout(() => setTrigger((n) => n + 1), 50);
      } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    });
  }

  if (done && !prize) {
    return <p className="text-sm text-ink-muted">🎡 You&apos;ve used today&apos;s spin. Check in again tomorrow for another!</p>;
  }

  return (
    <div className="relative flex flex-col items-center">
      {revealed && <Confetti />}
      <SpinWheel segments={SEGMENTS} targetKey={target} spinTrigger={trigger} size={220} onSpinEnd={() => { setRevealed(true); setDone(true); }} />
      <div className="relative mt-4 text-center">
        {revealed && prize != null ? (
          <div className="text-lg font-bold text-ok">🎉 You won +{prize} 💎!</div>
        ) : !clockedIn ? (
          <p className="text-sm text-ink-muted">Clock in first to unlock your daily spin.</p>
        ) : (
          <button className="btn-primary" disabled={pending || target != null} onClick={spin}>
            {pending ? "Spinning…" : "🎡 Spin the wheel"}
          </button>
        )}
        {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      </div>
    </div>
  );
}
