"use client";

import { useState } from "react";
import { LevelStatusPill, type LevelState } from "./LevelStatusPill";
import { LevelRoadmapModal, type RoadmapRuleVM } from "./LevelRoadmapModal";
import type { ChecklistItem } from "@/services/growth";

const CARD_STYLES: Record<LevelState, string> = {
  completed: "border-2 border-ok bg-green-50",
  current: "border-2 border-brand-500 bg-brand-50",
  ready: "level-ready-glow border-2 border-amber-400 bg-amber-50",
  locked: "border border-slate-200 bg-slate-50 opacity-80",
};
const ICONS: Record<LevelState, string> = { completed: "✅", current: "📍", ready: "✨", locked: "🔒" };

export function GrowthLevelCard({ rule, levelState, checklist }: { rule: RoadmapRuleVM; levelState: LevelState; checklist: ChecklistItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={`w-full rounded-xl p-3 text-center transition hover:shadow-md ${CARD_STYLES[levelState]}`}>
        <div className="text-2xl">{ICONS[levelState]}</div>
        <div className="mt-1 text-sm font-bold text-ink">Lv.{rule.levelNumber}</div>
        <div className="min-h-[28px] text-[11px] leading-tight text-ink-muted">{rule.levelName}</div>
        <div className="mt-1"><LevelStatusPill state={levelState} /></div>
      </button>
      <LevelRoadmapModal open={open} onClose={() => setOpen(false)} rule={rule} levelState={levelState} checklist={checklist} />
    </>
  );
}
