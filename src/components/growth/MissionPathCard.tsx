"use client";

import { useState, useTransition } from "react";
import { Progress } from "@/components/ui";
import { startMission, completeMission } from "@/app/(app)/badges/growth-actions";

export interface MissionVM {
  id: string;
  title: string;
  description: string | null;
  pointsReward: number;
  badgeName: string | null;
  difficulty: string;
  missionType: string;
  status: string;
  progressValue: number;
  targetValue: number;
}

const DIFFICULTY_STYLES: Record<string, string> = {
  EASY: "bg-green-100 text-green-700",
  NORMAL: "bg-sky-100 text-sky-700",
  CHALLENGE: "bg-amber-100 text-amber-700",
  ADVANCED: "bg-rose-100 text-rose-700",
};

/** Section 4 — Next Best Missions (mission path card). */
export function MissionPathCard({ mission }: { mission: MissionVM }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const pct = Math.min(100, Math.round((mission.progressValue / Math.max(mission.targetValue, 1)) * 100));
  const isAuto = mission.missionType.startsWith("AUTO_");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold text-ink">{mission.title}</div>
          {mission.description && <p className="mt-0.5 text-xs text-ink-soft">{mission.description}</p>}
        </div>
        <span className={`badge shrink-0 ${DIFFICULTY_STYLES[mission.difficulty] ?? "bg-slate-100 text-slate-600"}`}>{mission.difficulty}</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-muted">
        <span>💎 +{mission.pointsReward} pts</span>
        {mission.badgeName && <span>🏅 {mission.badgeName}</span>}
      </div>

      <div className="mt-3"><Progress value={pct} rag={mission.status === "COMPLETED" ? "ok" : "warn"} /></div>
      <div className="mt-1 text-[11px] text-ink-muted">{mission.progressValue}/{mission.targetValue}</div>

      {err && <p className="mt-2 text-xs text-danger">{err}</p>}

      <div className="mt-3">
        {mission.status === "COMPLETED" ? (
          <span className="badge bg-green-100 text-green-700">✅ Completed</span>
        ) : isAuto ? (
          <span className="badge bg-slate-100 text-slate-600">📊 Tracked automatically — View Progress above</span>
        ) : mission.status === "NOT_STARTED" ? (
          <button
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => start(async () => { setErr(null); try { await startMission(mission.id); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          >
            Start Mission
          </button>
        ) : (
          <button
            className="btn-primary px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => start(async () => { setErr(null); try { await completeMission(mission.id); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
          >
            Mark Complete
          </button>
        )}
      </div>
    </div>
  );
}
