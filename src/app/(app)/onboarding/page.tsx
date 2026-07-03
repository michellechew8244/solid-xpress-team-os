import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { shortDate } from "@/lib/format";
import { Avatar, Card, PageHeader, Progress, SectionTitle } from "@/components/ui";
import { AddItemForm, ItemActiveToggle, StaffItemCheckbox } from "@/components/OnboardingChecklistControls";
import { requireFeature } from "@/lib/features";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  await requireFeature("onboarding");
  const user = await getCurrentUser();
  if (!user) return null;
  const canManage = isBoss(user.role) || user.role === "HR_ADMIN";
  const sp = await searchParams;

  const items = await prisma.onboardingTemplateItem.findMany({ orderBy: { order: "asc" } });
  const activeItems = items.filter((i) => i.active);

  // Whose checklist are we looking at? Staff always see their own; HR/Boss can pick.
  const targetId = canManage && sp.staff ? sp.staff : user.id;
  const [target, statuses, staffList] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetId }, select: { id: true, name: true, avatarColor: true, joinDate: true, profile: { select: { onboardingProgress: true } } } }),
    prisma.onboardingItemStatus.findMany({ where: { userId: targetId } }),
    canManage
      ? prisma.user.findMany({ where: { role: { in: ["STAFF", "DEPARTMENT_HEAD"] }, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, profile: { select: { onboardingProgress: true } } } })
      : Promise.resolve([]),
  ]);
  const doneSet = new Set(statuses.map((s) => s.itemId));
  const progress = target?.profile?.onboardingProgress ?? 0;

  return (
    <>
      <PageHeader title="Onboarding Checklist" subtitle="Structured steps for every new joiner — completion can trigger the welcome diamond bonus" />

      {canManage && (
        <Card className="mb-6">
          <SectionTitle>Checklist Template ({activeItems.length} active steps)</SectionTitle>
          <div className="mb-3 divide-y divide-slate-100">
            {items.map((i) => (
              <div key={i.id} className={`flex items-center justify-between py-2 text-sm ${i.active ? "" : "opacity-50"}`}>
                <div><span className="font-medium text-ink">{i.title}</span>{i.description && <span className="ml-2 text-xs text-ink-muted">{i.description}</span>}</div>
                <ItemActiveToggle itemId={i.id} active={i.active} />
              </div>
            ))}
            {items.length === 0 && <p className="py-2 text-sm text-ink-muted">No steps defined yet — add the first one below.</p>}
          </div>
          <AddItemForm />
        </Card>
      )}

      {canManage && staffList.length > 0 && (
        <Card className="mb-6">
          <SectionTitle>Staff Progress</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {staffList.map((s) => (
              <a key={s.id} href={`/onboarding?staff=${s.id}`} className={`rounded-lg border p-3 hover:bg-slate-50 ${s.id === targetId ? "border-brand-400 bg-brand-50/40" : "border-slate-200"}`}>
                <div className="flex items-center justify-between text-sm"><span className="font-semibold text-ink">{s.name}</span><span className="text-xs text-ink-muted">{s.profile?.onboardingProgress ?? 0}%</span></div>
                <div className="mt-2"><Progress value={s.profile?.onboardingProgress ?? 0} rag={(s.profile?.onboardingProgress ?? 0) >= 100 ? "ok" : undefined} /></div>
              </a>
            ))}
          </div>
        </Card>
      )}

      {target && (
        <Card>
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={target.name} color={target.avatarColor} size={40} />
            <div>
              <div className="font-bold text-ink">{target.name}{target.id === user.id ? " (you)" : ""}</div>
              <div className="text-xs text-ink-muted">Joined {shortDate(target.joinDate)} · {progress}% complete</div>
            </div>
          </div>
          <Progress value={progress} rag={progress >= 100 ? "ok" : undefined} />
          <div className="mt-4 divide-y divide-slate-100">
            {activeItems.map((i) => {
              const done = doneSet.has(i.id);
              return (
                <div key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
                  {canManage ? (
                    <StaffItemCheckbox userId={target.id} itemId={i.id} done={done} />
                  ) : (
                    <span>{done ? "✅" : "⬜"}</span>
                  )}
                  <div className={done ? "text-ink line-through opacity-60" : "text-ink"}>
                    <div className="font-medium">{i.title}</div>
                    {i.description && <div className="text-xs text-ink-muted">{i.description}</div>}
                  </div>
                </div>
              );
            })}
            {activeItems.length === 0 && <p className="py-2 text-sm text-ink-muted">No active checklist steps.</p>}
          </div>
          {progress >= 100 && <p className="mt-3 text-sm font-semibold text-ok">🎓 Onboarding complete!</p>}
        </Card>
      )}
    </>
  );
}
