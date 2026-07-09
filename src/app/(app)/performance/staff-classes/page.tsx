import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { currentPeriod } from "@/lib/enums";
import { computeIndividualPerformance } from "@/lib/performance";
import { STAFF_CLASS_BANDS, classForScore, type StaffClass } from "@/lib/staff-class";
import { Card, PageHeader, SectionTitle, StatCard, Pill, Avatar } from "@/components/ui";
import { requireFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function StaffClassesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireFeature("staff-classes");
  const me = await getCurrentUser();
  if (!me) return null;
  const manager = isBoss(me.role) || me.role === "DEPARTMENT_HEAD" || me.role === "HR_ADMIN";
  if (!manager) return null; // requireFeature already gates, belt-and-braces

  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentPeriod();

  const staff = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] },
      NOT: { email: { endsWith: "@solidxpress.system" } },
      ...(me.role === "DEPARTMENT_HEAD" && me.departmentId ? { departmentId: me.departmentId } : {}),
    },
    select: { id: true, name: true, avatarColor: true, jobTitle: true, department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const rows = await Promise.all(staff.map(async (u) => {
    const ind = await computeIndividualPerformance(u.id, period);
    return { ...u, score: ind.score, grade: ind.grade, cls: ind.staffClass, inquiry: ind.inquiryRatePct, results: ind.resultRecords, position: ind.positionName };
  }));
  rows.sort((a, b) => b.score - a.score);

  const counts: Record<StaffClass, number> = { A: 0, B: 0, C: 0 };
  for (const r of rows) counts[r.cls] += 1;

  return (
    <>
      <PageHeader title="🏷️ Staff Classes — A / B / C" subtitle={`Monthly classification from the result score · A ≥ 85 · B 70–84 · C < 70 · ${period}`} />

      <form className="mb-4 flex items-center gap-2" action="/performance/staff-classes" method="get">
        <input type="month" name="period" defaultValue={period} className="input w-44" />
        <button className="btn-ghost">View</button>
      </form>

      <div className="mb-5 grid gap-3 grid-cols-3">
        {STAFF_CLASS_BANDS.map((b) => (
          <StatCard
            key={b.cls}
            label={`${b.emoji} ${b.label}`}
            value={counts[b.cls]}
            sub={b.cls === "A" ? "score ≥ 85" : b.cls === "B" ? "score 70–84" : "score < 70"}
            rag={b.cls === "A" ? "ok" : b.cls === "B" ? "neutral" : counts.C > 0 ? "warn" : "ok"}
          />
        ))}
      </div>

      <Card className="mb-5">
        <SectionTitle>What each class means</SectionTitle>
        <ul className="space-y-1.5 text-sm text-ink-soft">
          {STAFF_CLASS_BANDS.map((b) => (
            <li key={b.cls} className="flex items-start gap-2">
              <span className={`badge shrink-0 ${b.badge}`}>{b.emoji} {b.label}</span>
              <span>{b.meaning}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-ink-muted">
          Classes follow the result-oriented score (Business Result 40% · Customer Outcome 25% · Accuracy &amp; Risk 20% · Contribution 10% · Discipline 5%) and update live as results are approved.
        </p>
      </Card>

      <Card>
        <SectionTitle action={<Link href="/performance/monthly-review" className="text-xs font-semibold text-brand-600">Performance cards →</Link>}>
          Classification · {period}
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-muted">
                <th className="py-2 pr-2">Staff</th><th className="px-2">Class</th><th className="px-2">Score</th><th className="px-2">Grade</th><th className="px-2">Inquiries</th><th className="px-2">Results</th><th className="px-2">Card</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const band = classForScore(r.score);
                return (
                  <tr key={r.id}>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.name} color={r.avatarColor} size={28} />
                        <div>
                          <div className="font-medium text-ink">{r.name}</div>
                          <div className="text-[11px] text-ink-muted">{r.department?.name ?? "—"}{r.position ? ` · ${r.position}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2"><span className={`badge ${band.badge}`}>{band.emoji} {band.label}</span></td>
                    <td className="px-2 font-bold text-brand-700">{r.score}</td>
                    <td className="px-2"><Pill value={r.score >= 80 ? "OK" : r.score >= 70 ? "WARN" : "DANGER"} label={r.grade} /></td>
                    <td className="px-2 text-xs">{r.inquiry !== null ? `${r.inquiry}%` : "—"}</td>
                    <td className="px-2 text-xs">{r.results}</td>
                    <td className="px-2 text-xs"><Link className="text-brand-600 hover:underline" href={`/performance/monthly-review?period=${period}&user=${r.id}`}>view →</Link></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-xs text-ink-muted">No active staff in scope.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
