import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { currentPeriod } from "@/lib/enums";
import { PROFILE_RESULT_AREAS } from "@/lib/result-data";
import { Card, PageHeader, SectionTitle, Pill } from "@/components/ui";
import { AssignProfileForm, RemoveProfileButton, CaseCreditRow, SeedResultDefaultsButton, TeamHeadResultForm } from "@/components/CSProfileControls";

const lab = (s: string) => s.replace(/^CS_/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default async function CSProfilesPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!isBoss(me.role) && me.role !== "HR_ADMIN" && me.role !== "DEPARTMENT_HEAD") redirect("/dashboard");
  const canEdit = isBoss(me.role) || me.role === "HR_ADMIN";
  const period = currentPeriod();

  const [profiles, credits, staff, headResults] = await Promise.all([
    prisma.cSRoleProfile.findMany({ where: { isActive: true } }),
    prisma.caseCreditSetting.findMany({ where: { isActive: true }, orderBy: { baseCredit: "asc" } }),
    prisma.user.findMany({ where: { isActive: true, role: { notIn: ["SUPER_ADMIN", "MANAGEMENT"] }, NOT: { email: { endsWith: "@solidxpress.system" } } }, select: { id: true, name: true, role: true, department: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.teamHeadDevelopmentResult.findMany({ where: { month: period } }),
  ]);
  const staffById = new Map(staff.map((u) => [u.id, u]));
  const heads = staff.filter((u) => u.role === "DEPARTMENT_HEAD" || profiles.some((p) => p.userId === u.id && p.profileType === "CS_TEAM_HEAD"));

  return (
    <>
      <PageHeader
        title="👥 CS Role Profiles & Result Setup"
        subtitle="Assign each CS staff a role profile — their KPI measures the RESULTS of that role. Case credits track workload fairness only."
        action={canEdit && credits.length === 0 ? <SeedResultDefaultsButton /> : undefined}
      />

      {canEdit && (
        <Card className="mb-5">
          <SectionTitle>Assign a role profile</SectionTitle>
          <AssignProfileForm people={staff.map((u) => ({ id: u.id, name: `${u.name}${u.department ? ` (${u.department.name})` : ""}` }))} />
        </Card>
      )}

      <Card className="mb-5">
        <SectionTitle>Current assignments ({profiles.length})</SectionTitle>
        {profiles.length === 0 ? <p className="text-sm text-ink-muted">No profiles assigned yet.</p> : (
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => {
              const u = staffById.get(p.userId);
              return (
                <div key={p.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <div className="font-semibold">{u?.name ?? "—"}</div>
                  <div className="text-xs text-ink-muted">{lab(p.profileType)} · benchmark {p.monthlyWorkloadBenchmark} credits/mo {canEdit && <RemoveProfileButton userId={p.userId} />}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Profile result areas reference */}
      <Card className="mb-5">
        <SectionTitle>Result areas per profile (the KPI)</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(PROFILE_RESULT_AREAS).map(([profile, areas]) => (
            <div key={profile} className="rounded-xl border border-slate-100 p-3">
              <div className="mb-1 text-sm font-bold text-ink">{lab(profile)}</div>
              <ul className="space-y-0.5 text-xs text-ink-soft">
                {areas.map((a) => <li key={a.area} className="flex justify-between gap-2"><span>{a.area}</span><b>{a.weight}%</b></li>)}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {/* Case credits — workload fairness */}
      <Card className="mb-5">
        <SectionTitle>Case credits (workload indicator only — never the KPI)</SectionTitle>
        {credits.length === 0 ? (
          <div>{canEdit ? <SeedResultDefaultsButton /> : <p className="text-sm text-ink-muted">Not configured yet.</p>}</div>
        ) : canEdit ? (
          <div>{credits.map((c) => <CaseCreditRow key={c.id} workType={c.workType} baseCredit={c.baseCredit} description={c.description} />)}</div>
        ) : (
          <div className="flex flex-wrap gap-1">{credits.map((c) => <Pill key={c.id} value="OK" label={`${c.description ?? c.workType} = ${c.baseCredit}`} />)}</div>
        )}
      </Card>

      {/* Team head development results */}
      {canEdit && (
        <Card>
          <SectionTitle>Team Head development result — {period}</SectionTitle>
          <p className="mb-2 text-xs text-ink-muted">Measure whether the TEAM improved, not how many coaching sessions were held.</p>
          {heads.length === 0 ? <p className="text-sm text-ink-muted">No team heads found — assign a CS Team Head profile or department head role first.</p> : (
            <TeamHeadResultForm heads={heads.map((h) => ({ id: h.id, name: h.name }))} month={period} existing={headResults[0] ?? null} />
          )}
          {headResults.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {headResults.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">
                  <b>{staffById.get(r.teamHeadId)?.name ?? "—"}</b> · team +{r.teamScoreImprovement} pts · mistakes −{r.repeatedMistakeReduction} · backlog −{r.inquiryBacklogReduction}
                  {r.backupPersonReady && " · backup ✅"}{r.juniorStaffIndependent && " · junior ✅"}
                  {r.sopImpactResult && <div>SOP: {r.sopImpactResult}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
