import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/enums";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { getDiamondAuthoritySetting } from "@/lib/diamonds";
import { DiamondAuthorityForm, AuthorityToggle } from "@/components/diamonds/DiamondAuthorityControls";

export default async function DiamondAuthoritySettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!isBoss(user.role)) redirect("/dashboard");

  const [setting, grantable] = await Promise.all([
    getDiamondAuthoritySetting(),
    // Non-boss management/HR/dept-heads who could be granted direct authority.
    prisma.user.findMany({ where: { role: { in: ["HR_ADMIN", "DEPARTMENT_HEAD", "MANAGEMENT", "FINANCE_ADMIN"] }, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, hasOwnerDiamondAuthority: true } }),
  ]);

  return (
    <>
      <PageHeader title="Diamond Authority Settings" subtitle="Owner controls for who can propose or generate diamonds." />

      <Card className="mb-6">
        <SectionTitle>Proposal & budget rules</SectionTitle>
        <DiamondAuthorityForm setting={setting} />
      </Card>

      <Card>
        <SectionTitle>Direct generation authority</SectionTitle>
        <p className="mb-3 -mt-1 text-xs text-ink-muted">Owners/Bosses always have full authority. Grant a specific person direct diamond-generation authority below (logged in the audit trail).</p>
        <div className="divide-y divide-slate-100">
          {grantable.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="text-sm"><span className="font-semibold text-ink">{u.name}</span> <span className="text-xs text-ink-muted">· {ROLE_LABELS[u.role] ?? u.role}</span></div>
              <AuthorityToggle userId={u.id} granted={u.hasOwnerDiamondAuthority} />
            </div>
          ))}
          {grantable.length === 0 && <p className="py-2 text-sm text-ink-muted">No eligible users.</p>}
        </div>
      </Card>
    </>
  );
}
