import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { klNow } from "@/lib/attendance";
import { LobbyStage } from "@/components/LobbyStage";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const { dateStr } = klNow();

  const [records, totalCrew] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { date: dateStr, clockIn: { not: null } },
      include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } },
      orderBy: { clockIn: "asc" },
    }),
    prisma.user.count({ where: { isActive: true, role: { in: ["STAFF", "DEPARTMENT_HEAD", "HR_ADMIN", "FINANCE_ADMIN", "MANAGEMENT"] } } }),
  ]);

  const crew = records
    .filter((r) => r.user)
    .map((r) => ({
      id: r.user.id,
      name: r.user.name,
      color: r.user.avatarColor,
      photo: r.user.avatarUrl,
      late: r.lateMinutes > 0,
      time: r.clockIn ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(r.clockIn) : "",
    }));

  // Check-in URL for the QR (staff scan → open the app on their phone).
  const base = process.env.SUPABASE_URL ? "https://solid-xpress-team-os.vercel.app" : "";
  return <LobbyStage crew={crew} total={totalCrew} date={dateStr} checkinUrl={`${base}/attendance`} />;
}
