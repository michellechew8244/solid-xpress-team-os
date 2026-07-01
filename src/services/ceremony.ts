import { prisma } from "@/lib/prisma";
import { currentPeriod } from "@/lib/enums";

/**
 * Monthly Recognition Ceremony data (spec §10): the awards announced each month.
 * Everything is derived from the month's points ledger, reviews and lucky-draw
 * results so the ceremony reflects real performance.
 */
export async function getCeremony(period = currentPeriod()) {
  const staffWhere = { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true };

  const [byEarned, departments, reviews, winners] = await Promise.all([
    prisma.user.findMany({ where: staffWhere, include: { department: true }, orderBy: { monthlyEarned: "desc" } }),
    prisma.department.findMany(),
    prisma.performanceReview.findMany({ where: { period }, include: { staff: { include: { department: true } } } }),
    prisma.luckyDrawPrize.findMany({ where: { winnerUserId: { not: null } }, include: { winner: { include: { department: true } }, campaign: true } }),
  ]);

  // Sum positive points of a given type per user this period.
  async function topByType(type: string) {
    const grouped = await prisma.pointsTransaction.groupBy({
      by: ["userId"],
      where: { period, type, amount: { gt: 0 } },
      _sum: { amount: true },
    });
    grouped.sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0));
    const top = grouped[0];
    if (!top) return null;
    const user = byEarned.find((u) => u.id === top.userId) ?? (await prisma.user.findUnique({ where: { id: top.userId }, include: { department: true } }));
    return user ? { user, value: top._sum.amount ?? 0 } : null;
  }

  const [customerHero, teamPlayer, problemSolver] = await Promise.all([
    topByType("COMPLIMENT"),
    topByType("TEAMWORK"),
    topByType("PROBLEM_SOLVED"),
  ]);

  const companyChampion = byEarned[0] ?? null;

  // Department champion = top earner within each department.
  const deptChampions = departments
    .map((d) => {
      const top = byEarned.filter((u) => u.departmentId === d.id).sort((a, b) => b.monthlyEarned - a.monthlyEarned)[0];
      return top ? { department: d.name, user: top } : null;
    })
    .filter(Boolean) as { department: string; user: (typeof byEarned)[number] }[];

  // Most improved = highest monthly earned excluding the company champion (proxy).
  const mostImproved = byEarned[1] ?? null;

  // Zero mistake = active staff with no penalty this month but real activity.
  const zeroMistake = byEarned.filter((u) => u.monthlyDeducted === 0 && u.monthlyEarned > 0).slice(0, 8);

  // Best grade this month.
  const bestGraded = reviews.sort((a, b) => b.totalScore - a.totalScore)[0] ?? null;

  return { period, companyChampion, deptChampions, mostImproved, customerHero, teamPlayer, problemSolver, zeroMistake, winners, bestGraded };
}
