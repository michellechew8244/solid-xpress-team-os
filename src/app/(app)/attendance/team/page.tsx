import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { klNow } from "@/lib/attendance";
import { Avatar, Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { requireFeature } from "@/lib/features";

export default async function TeamAttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireFeature("attendance-team");
  const user = await getCurrentUser();
  if (!user) return null;
  const manager = isBoss(user.role) || user.role === "HR_ADMIN" || user.role === "DEPARTMENT_HEAD";

  const sp = await searchParams;
  const { dateStr, period: currentPeriodKey } = klNow();
  const period = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentPeriodKey;
  const deptScope = isBoss(user.role) || user.role === "HR_ADMIN" ? {} : { departmentId: user.departmentId ?? "" };

  const [staff, records] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true, ...deptScope },
      orderBy: { name: "asc" },
      select: { id: true, name: true, avatarColor: true, department: { select: { name: true } } },
    }),
    prisma.attendanceRecord.findMany({ where: { period, user: { ...deptScope } } }),
  ]);

  const byUser = new Map<string, typeof records>();
  for (const r of records) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  const todayRecords = records.filter((r) => r.date === dateStr);
  const presentToday = todayRecords.filter((r) => r.clockIn).length;
  const lateToday = todayRecords.filter((r) => r.lateMinutes > 0).length;
  const missingMonth = records.filter((r) => r.status === "MISSING_CHECK_OUT").length;

  const rows = staff.map((s) => {
    const recs = byUser.get(s.id) ?? [];
    const onTime = recs.filter((r) => r.clockIn && r.lateMinutes === 0 && r.status !== "MISSING_CHECK_OUT").length;
    const late = recs.filter((r) => r.lateMinutes > 0).length;
    const missing = recs.filter((r) => r.status === "MISSING_CHECK_OUT").length;
    const leave = recs.filter((r) => r.status === "LEAVE" || r.workType === "APPROVED_LEAVE").length;
    const lateMin = recs.reduce((sum, r) => sum + r.lateMinutes, 0);
    const otMin = recs.reduce((sum, r) => sum + r.overtimeMinutes, 0);
    const diamonds = recs.reduce((sum, r) => sum + r.diamondAwarded - r.diamondDeducted, 0);
    return { ...s, onTime, late, missing, leave, lateMin, otMin, diamonds, needsCoaching: late + missing >= 3 };
  });

  return (
    <>
      <PageHeader
        title="Team Attendance"
        subtitle={`Monthly summary · ${period}`}
        action={<form method="get"><input name="month" type="month" defaultValue={period} className="input" /><button className="btn-ghost ml-2 px-3 py-1.5 text-sm">Go</button></form>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Checked in today" value={`${presentToday}/${staff.length}`} icon="✅" rag="ok" />
        <StatCard label="Late today" value={lateToday} icon="⏰" rag={lateToday ? "warn" : "ok"} />
        <StatCard label="Missing check-outs (month)" value={missingMonth} icon="🚫" rag={missingMonth ? "danger" : "ok"} />
      </div>

      <Card className="p-0">
        <div className="p-5 pb-2"><SectionTitle>Staff Summary ({period})</SectionTitle></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
              <th className="px-4 py-2">Staff</th><th className="px-4 py-2 text-right">On-time</th><th className="px-4 py-2 text-right">Late</th>
              <th className="px-4 py-2 text-right">Missing out</th><th className="px-4 py-2 text-right">Leave</th>
              <th className="px-4 py-2 text-right">Late min</th><th className="px-4 py-2 text-right">OT min</th>
              <th className="px-4 py-2 text-right">💎 Net</th><th className="px-4 py-2">Flag</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2"><div className="flex items-center gap-2"><Avatar name={r.name} color={r.avatarColor} size={24} /><div><div className="font-medium text-ink">{r.name}</div><div className="text-[10px] text-ink-muted">{r.department?.name ?? ""}</div></div></div></td>
                  <td className="px-4 py-2 text-right text-ok">{r.onTime}</td>
                  <td className={`px-4 py-2 text-right ${r.late ? "text-warn" : ""}`}>{r.late}</td>
                  <td className={`px-4 py-2 text-right ${r.missing ? "text-danger" : ""}`}>{r.missing}</td>
                  <td className="px-4 py-2 text-right">{r.leave}</td>
                  <td className="px-4 py-2 text-right">{r.lateMin}</td>
                  <td className="px-4 py-2 text-right">{r.otMin}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${r.diamonds >= 0 ? "text-ok" : "text-danger"}`}>{r.diamonds >= 0 ? "+" : ""}{r.diamonds}</td>
                  <td className="px-4 py-2 text-xs">{r.needsCoaching ? <span className="badge bg-rose-100 text-rose-700">Needs coaching</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
