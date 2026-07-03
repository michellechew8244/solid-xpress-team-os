import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { klNow } from "@/lib/attendance";
import { StatCard } from "@/components/ui";

/** Boss dashboard strip: today's attendance, ideas pipeline, active PKs. */
export async function OpsPulse() {
  const { dateStr, period } = klNow();
  const [staffCount, todayRecords, missingMonth, proposalsPending, proposalsAccepted, activePK] = await Promise.all([
    prisma.user.count({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true } }),
    prisma.attendanceRecord.findMany({ where: { date: dateStr }, select: { clockIn: true, lateMinutes: true } }),
    prisma.attendanceRecord.count({ where: { period, status: "MISSING_CHECK_OUT" } }),
    prisma.proposal.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.proposal.count({ where: { status: { in: ["ACCEPTED", "IMPLEMENTED"] }, acceptedAt: { gte: new Date(`${period}-01T00:00:00+08:00`) } } }),
    prisma.pKCampaign.count({ where: { status: "ACTIVE" } }),
  ]);
  const checkedIn = todayRecords.filter((r) => r.clockIn).length;
  const late = todayRecords.filter((r) => r.lateMinutes > 0).length;

  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Link href="/attendance/team"><StatCard label="Checked in today" value={`${checkedIn}/${staffCount}`} sub={late ? `${late} late` : "no late arrivals"} icon="⏰" rag={late ? "warn" : "ok"} /></Link>
      <Link href="/attendance/team"><StatCard label="Missing check-outs (month)" value={missingMonth} icon="🚫" rag={missingMonth ? "danger" : "ok"} /></Link>
      <Link href="/proposals"><StatCard label="Ideas pending / accepted" value={`${proposalsPending} / ${proposalsAccepted}`} sub="this month" icon="💡" rag={proposalsPending ? "warn" : "neutral"} /></Link>
      <Link href="/pk-arena"><StatCard label="Active PK campaigns" value={activePK} icon="⚔️" rag="neutral" /></Link>
    </div>
  );
}
