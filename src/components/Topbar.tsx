import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, growthLevelName } from "@/lib/enums";
import { logoutAction } from "@/app/(app)/actions";
import { Avatar } from "./ui";

export async function Topbar({
  user,
}: {
  user: { id: string; name: string; role: string; avatarColor: string; officialLevel: number; currentPoints: number; department?: { name: string } | null };
}) {
  const unread = await prisma.notification.count({ where: { userId: user.id, read: false } });

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
      <div className="pl-10 md:pl-0">
        <div className="text-xs text-ink-muted">{user.department?.name ?? "—"}</div>
        <div className="text-sm font-semibold text-ink">{ROLE_LABELS[user.role] ?? user.role}</div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 sm:block">
          💎 {user.currentPoints.toLocaleString()} pts
        </div>
        <div className="hidden rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 sm:block">
          Lv.{user.officialLevel} · {growthLevelName(user.officialLevel)}
        </div>

        <Link href="/notifications" className="relative rounded-lg p-2 text-lg hover:bg-slate-100" aria-label="Notifications">
          🔔
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2">
          <Avatar name={user.name} color={user.avatarColor} size={34} />
          <div className="hidden md:block">
            <div className="text-sm font-semibold leading-tight text-ink">{user.name}</div>
          </div>
        </div>

        <form action={logoutAction}>
          <button className="btn-ghost px-3 py-1.5 text-xs" type="submit">Sign out</button>
        </form>
      </div>
    </header>
  );
}
