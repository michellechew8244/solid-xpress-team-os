import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { Card, PageHeader, SectionTitle, Pill } from "@/components/ui";
import { savePositionKPI, seedPositionDefaults } from "../actions";

export default async function PositionKPIPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!isBoss(me.role) && me.role !== "HR_ADMIN") redirect("/dashboard");
  const canEdit = isBoss(me.role);

  const [positions, departments] = await Promise.all([
    prisma.positionKPI.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const parse = <T,>(s: string | null, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };

  return (
    <>
      <PageHeader
        title="🎯 Position KPI Setup"
        subtitle="Per-position score weightage, minimum job targets, diamond rewards, deduction schemes and commission eligibility."
        action={canEdit && positions.length === 0 ? (
          <form action={async () => { "use server"; await seedPositionDefaults(); }}>
            <button className="btn-primary">Load standard templates (CS / Ops / Fwd / Sales / Finance)</button>
          </form>
        ) : undefined}
      />

      {positions.length === 0 && (
        <Card className="mb-5 p-5 text-sm text-ink-muted">
          No position templates yet. Load the standard templates to get the spec defaults:
          CS 60 jobs · Operation 80 jobs · Forwarding 120 jobs, with the full reward and deduction schemes.
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {positions.map((p) => {
          const weights = parse<Record<string, number>>(p.weightsJson, {});
          const rewards = parse<{ label: string; diamonds: number }[]>(p.rewardRulesJson, []);
          const deductions = parse<{ label: string; diamonds: number }[]>(p.deductionRulesJson, []);
          return (
            <Card key={p.id}>
              <div className="flex items-start justify-between">
                <SectionTitle>{p.name}</SectionTitle>
                <div className="flex gap-1">
                  {p.commissionEligible && <span className="badge bg-emerald-100 text-emerald-700">Commission</span>}
                  {p.minJobTarget > 0 && <Pill value="OK" label={`${p.minJobTarget} jobs/mo`} />}
                  {!p.isActive && <span className="badge bg-slate-200 text-slate-600">Inactive</span>}
                </div>
              </div>

              {p.minJobTarget > 0 && (
                <p className="mb-2 text-xs text-ink-muted">
                  Volume banding: &lt;{p.zeroBandBelow} jobs → 0% · {p.zeroBandBelow}–{p.minJobTarget - 1} → partial ·
                  {" "}{p.minJobTarget} → 100% · up to {p.cap110At} → 110% · above → {p.volumeCapPct}% cap
                </p>
              )}

              {Object.keys(weights).length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-bold uppercase text-ink-muted">Score weightage</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(weights).map(([k, v]) => <span key={k} className="badge bg-slate-100 text-slate-700">{k} {v}%</span>)}
                  </div>
                </div>
              )}

              <details className="mb-1">
                <summary className="cursor-pointer text-xs font-bold uppercase text-ink-muted">💎 Diamond rewards ({rewards.length})</summary>
                <ul className="mt-1 space-y-0.5 text-xs">{rewards.map((r, i) => <li key={i} className="flex justify-between"><span>{r.label}</span><b className="text-ok">+{r.diamonds}</b></li>)}</ul>
              </details>
              <details className="mb-2">
                <summary className="cursor-pointer text-xs font-bold uppercase text-ink-muted">⚠️ Deduction scheme ({deductions.length})</summary>
                <ul className="mt-1 space-y-0.5 text-xs">{deductions.map((r, i) => <li key={i} className="flex justify-between"><span>{r.label}</span><b className="text-danger">{r.diamonds}</b></li>)}</ul>
              </details>

              {canEdit && (
                <form action={savePositionKPI} className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="name" value={p.name} />
                  <div><label className="label">Min jobs / month</label><input name="minJobTarget" type="number" className="input" defaultValue={p.minJobTarget} /></div>
                  <div><label className="label">0% below</label><input name="zeroBandBelow" type="number" className="input" defaultValue={p.zeroBandBelow} /></div>
                  <div><label className="label">110% cap at</label><input name="cap110At" type="number" className="input" defaultValue={p.cap110At} /></div>
                  <div className="col-span-2">
                    <label className="label">Linked department</label>
                    <select name="departmentId" className="input" defaultValue={p.departmentId ?? ""}>
                      <option value="">— none —</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="commissionEligible" defaultChecked={p.commissionEligible} /> Commission</label>
                  </div>
                  <div className="col-span-3"><button className="btn-primary w-full">Save {p.name}</button></div>
                </form>
              )}
            </Card>
          );
        })}
      </div>

      {canEdit && positions.length > 0 && (
        <Card className="mt-5">
          <SectionTitle>Add a new position template</SectionTitle>
          <form action={savePositionKPI} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="sm:col-span-2"><label className="label">Position name</label><input name="name" className="input" placeholder="e.g. Haulage Coordinator" required /></div>
            <div><label className="label">Min jobs / month</label><input name="minJobTarget" type="number" className="input" defaultValue={0} /></div>
            <div>
              <label className="label">Department</label>
              <select name="departmentId" className="input"><option value="">— none —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </div>
            <div className="col-span-2 sm:col-span-4"><button className="btn-primary">Create position</button></div>
          </form>
        </Card>
      )}
    </>
  );
}
