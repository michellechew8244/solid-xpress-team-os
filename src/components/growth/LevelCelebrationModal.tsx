"use client";

import { Confetti } from "@/components/Confetti";

/** Small celebration effect for a level-up moment: confetti burst + message. */
export function LevelCelebrationModal({
  open,
  levelNumber,
  levelName,
  onClose,
}: {
  open: boolean;
  levelNumber: number;
  levelName: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <Confetti />
        <div className="relative text-5xl">🎉</div>
        <div className="relative mt-3 text-xs font-bold uppercase tracking-wide text-brand-600">Level Up!</div>
        <h2 className="relative mt-1 text-2xl font-bold text-ink">
          You unlocked Lv.{levelNumber} — {levelName}
        </h2>
        <p className="relative mt-2 text-sm text-ink-muted">Keep growing with Solid Xpress.</p>
        <button className="btn-primary relative mt-5 w-full" onClick={onClose}>Continue</button>
      </div>
    </div>
  );
}
