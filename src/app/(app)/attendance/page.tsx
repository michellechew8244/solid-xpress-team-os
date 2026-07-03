import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { klNow, computeStreak, getAttendanceSetting, WORK_TYPES, finalizeOpenDays } from "@/lib/attendance";
import { STREAK_MILESTONES } from "@/lib/games";
import { Avatar, Card, PageHeader, Pill, SectionTitle, StatCard } from "@/components/ui";
import { ClockButtons, MarkAttendanceForm } from "@/components/AttendanceControls";
import { DailySpinGame } from "@/components/DailySpinGame";
import { requireFeature } from "@/lib/features";

const STATUS_PILL: Record<string, string> = { PRESENT: "OK", COMPLETED: "OK", LATE: "WARN", ABSENT: "DANGER", LEAVE: "COMPLETED", EARLY_LEAVE: "WARN", MISSING_CHECK_OUT: "DANGER" };

function klTime(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default async function AttendancePage() {
  await requireFeature("attendance");
  const user = await getCurrentUser();
  if (!user) return null;
  const { dateStr, period } = klNow();
  const isManager = isBoss(user.role) || user.role === "HR_ADMIN" || user.role === "DEPARTMENT_HEAD";
  const deptScope = isBoss(user.role) || user.role === "HR_ADMIN" ? {} : { departmentId: user.departmentId ?? "" };

  // Settle any past open days (missing check-outs, perfect-month awards) lazily.
  await finalizeOpenDays(user.id);

  const [today, myMonth, teamMonth, staff, todaySpin, streak, setting] = await Promise.all([
    prisma.attendanceRecord.findUnique({ where: { userId_date: { userId: user.id, date: dateStr } } }),
    prisma.attendanceRecord.findMany({ where: { userId: user.id, period }, orderBy: { date: "desc" } }),
    isManager
      ? prisma.attendanceRecord.findMany({ where: { period, user: { ...deptScope } }, include: { user: { select: { name: true, avatarColor: true } } }, orderBy: { date: "desc" }, take: 200 })
      : Promise.resolve([]),
    isManager
      ? prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true, ...deptScope }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.dailySpin.findUnique({ where: { userId_date: { userId: user.id, date: dateStr } } }),
    computeStreak(user.id, dateStr),
    getAttendanceSetting(),
  ]);

  const count = (s: string) => myMonth.filter((r) => r.status === s).length;
  const diamondsToday = (today?.diamondAwarded ?? 0) - (today?.diamondDeducted ?? 0);
  const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
  const nextMilestone = Object.keys(STREAK_MILESTONES).map(Number).sort((a, b) => a - b).find((d) => d > streak);

  return (
    <>
      <PageHeader
        title="Attendance Centre"
        subtitle={`Check-in/out on secure server time (Asia/Kuala_Lumpur) · ${period}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/attendance/correction" className="btn-ghost">🕰️ Request Correction</Link>
            {isManager && <Link href="/attendance/team" className="btn-ghost">👥 Team</Link>}
            {(isBoss(user.role) || user.role === "HR_ADMIN") && <Link href="/attendance/settings" className="btn-ghost">⚙️ Settings</Link>}
          </div>
        }
      />

      <Card className="mb-6">
        <SectionTitle>Today · {dateStr}</SectionTitle>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 text-sm text-ink-muted">
            <div>
              Check-in: <strong className="text-ink">{klTime(today?.clockIn ?? null)}</strong> · Check-out: <strong className="text-ink">{klTime(today?.clockOut ?? null)}</strong>
              {today && <span className="ml-2"><Pill value={STATUS_PILL[today.status] ?? "WARN"} label={today.correctionStatus ?? today.status} /></span>}
            </div>
            {today && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span>Work type: <strong className="text-ink">{WORK_TYPES[today.workType] ?? today.workType}</strong></span>
                {today.lateMinutes > 0 && <span className="text-danger">Late {today.lateMinutes} min</span>}
                {today.earlyLeaveMinutes > 0 && <span className="text-warn">Early leave {today.earlyLeaveMinutes} min</span>}
                {today.overtimeMinutes > 0 && <span className="text-ok">OT {hm(today.overtimeMinutes)}</span>}
                {today.totalWorkMinutes > 0 && <span>Worked {hm(today.totalWorkMinutes)}</span>}
                <span className={diamondsToday >= 0 ? "text-ok" : "text-danger"}>💎 {diamondsToday >= 0 ? "+" : ""}{diamondsToday} today</span>
              </div>
            )}
          </div>
          <ClockButtons clockedIn={Boolean(today?.clockIn)} clockedOut={Boolean(today?.clockOut)} workTypes={WORK_TYPES} photoRequired={setting.photoRequired} />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Standard hours {setting.standardStartTime}–{setting.standardEndTime} · check-in after {setting.standardStartTime} +{setting.gracePeriodMinutes} min grace is Late
          {setting.diamondRewardEnabled ? ` · on-time +${setting.onTimeDiamondReward} 💎 · complete day +${setting.completeDayDiamondReward} 💎` : ""}.
        </p>
      </Card>

      {/* 🎮 Check-in games */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle>🔥 Check-in Streak</SectionTitle>
          <div className="flex items-end gap-3">
            <div className="text-5xl font-black text-brand-600">{streak}</div>
            <div className="pb-1 text-sm text-ink-muted">day{streak === 1 ? "" : "s"} in a row</div>
          </div>
          {nextMilestone ? (
            <p className="mt-2 text-sm text-ink-muted">
              {nextMilestone - streak} more day{nextMilestone - streak === 1 ? "" : "s"} to unlock <strong className="text-ink">+{STREAK_MILESTONES[nextMilestone]} 💎</strong> at a {nextMilestone}-day streak.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ok">🏆 You&apos;ve hit the top streak milestone — legendary consistency!</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(STREAK_MILESTONES).map(([d, b]) => (
              <span key={d} className={`badge ${streak >= Number(d) ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                {streak >= Number(d) ? "✅" : "🎯"} {d}d → +{b}💎
              </span>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>🎡 Daily Check-in Spin</SectionTitle>
          <p className="mb-2 -mt-1 text-xs text-ink-muted">One free spin every day you clock in. Win 2–20 diamonds!</p>
          <DailySpinGame clockedIn={Boolean(today?.clockIn)} alreadySpun={Boolean(todaySpin)} />
        </Card>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Present (month)" value={count("PRESENT")} icon="✅" rag="ok" />
        <StatCard label="Late (month)" value={count("LATE")} icon="⏰" rag={count("LATE") ? "warn" : "ok"} />
        <StatCard label="Absent (month)" value={count("ABSENT")} icon="🚫" rag={count("ABSENT") ? "danger" : "ok"} />
        <StatCard label="Leave (month)" value={count("LEAVE")} icon="🌴" rag="neutral" />
      </div>

      <Card className="p-0">
        <div className="p-5 pb-2"><SectionTitle>My Records ({period})</SectionTitle></div>
        <div className="divide-y divide-slate-100">
          {myMonth.length === 0 && <p className="p-5 text-sm text-ink-muted">No records this month yet.</p>}
          {myMonth.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-2 text-sm">
              <span className="font-medium text-ink">{r.date}</span>
              <span className="text-xs text-ink-muted">
                {klTime(r.clockIn)}{r.clockInPhotoUrl && <a href={r.clockInPhotoUrl} target="_blank" rel="noreferrer" className="ml-0.5 hover:opacity-70" title="Clock-in photo">📷</a>}
                {" → "}
                {klTime(r.clockOut)}{r.clockOutPhotoUrl && <a href={r.clockOutPhotoUrl} target="_blank" rel="noreferrer" className="ml-0.5 hover:opacity-70" title="Clock-out photo">📷</a>}
                {r.note ? ` · ${r.note}` : ""}
              </span>
              <Pill value={STATUS_PILL[r.status] ?? "WARN"} label={r.status} />
            </div>
          ))}
        </div>
      </Card>

      {isManager && (
        <>
          <Card className="mt-6">
            <SectionTitle>Mark Attendance (HR / Manager)</SectionTitle>
            <MarkAttendanceForm staff={staff} />
          </Card>

          <Card className="mt-6 p-0">
            <div className="p-5 pb-2"><SectionTitle>Team Records ({period})</SectionTitle></div>
            <div className="divide-y divide-slate-100">
              {teamMonth.length === 0 && <p className="p-5 text-sm text-ink-muted">No team records this month.</p>}
              {teamMonth.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={r.user.name} color={r.user.avatarColor} size={24} />
                    <span className="truncate font-medium text-ink">{r.user.name}</span>
                  </div>
                  <span className="text-xs text-ink-muted">
                    {r.date} · {klTime(r.clockIn)}{r.clockInPhotoUrl && <a href={r.clockInPhotoUrl} target="_blank" rel="noreferrer" className="ml-0.5 hover:opacity-70" title="Clock-in photo">📷</a>}
                    {" → "}
                    {klTime(r.clockOut)}{r.clockOutPhotoUrl && <a href={r.clockOutPhotoUrl} target="_blank" rel="noreferrer" className="ml-0.5 hover:opacity-70" title="Clock-out photo">📷</a>}
                  </span>
                  <Pill value={STATUS_PILL[r.status] ?? "WARN"} label={r.status} />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
