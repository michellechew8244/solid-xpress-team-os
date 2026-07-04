import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { SALES_PLAYBOOKS, claudeConfigured } from "@/lib/ai-reply";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { ResponseCentre } from "@/components/ResponseCentre";
import { ReplyHelper, SalesCoach, TemplateManager } from "@/components/ReplyHelper";
import { seedResponseTemplates } from "./actions";

export default async function ResponseCentrePage() {
  const me = await getCurrentUser();
  if (!me) return null;
  const manage = isBoss(me.role) || me.role === "HR_ADMIN";
  const claudeOn = claudeConfigured();

  const templates = await prisma.aIResponseTemplate.findMany({ where: manage ? {} : { isActive: true }, orderBy: { title: "asc" } });

  return (
    <>
      <PageHeader
        title="✉️ AI Response Centre"
        subtitle="Don't know how to reply? Paste the message and get a draft. Plus sales follow-up & closing coaching, and copy-paste templates."
        action={isBoss(me.role) && templates.length === 0 ? (
          <form action={async () => { "use server"; await seedResponseTemplates(); }}>
            <button className="btn-primary">Load standard templates</button>
          </form>
        ) : undefined}
      />

      <Card className="mb-5">
        <SectionTitle>🆘 Help me reply</SectionTitle>
        <ReplyHelper claudeOn={claudeOn} />
      </Card>

      <Card className="mb-5">
        <SectionTitle>🤝 Sales Coach — follow-up &amp; closing</SectionTitle>
        <p className="mb-2 text-xs text-ink-muted">Proven freight-forwarding plays: what to do, what to say, and why it works. Every script is copy-paste ready.</p>
        <SalesCoach playbooks={SALES_PLAYBOOKS} claudeOn={claudeOn} />
      </Card>

      <Card className="mb-5">
        <SectionTitle>📋 Copy-paste templates</SectionTitle>
        {templates.length === 0
          ? <p className="text-sm text-ink-muted">No templates yet{isBoss(me.role) ? " — load the standard set with the button above" : " — ask management to load them"}.</p>
          : <ResponseCentre templates={templates.filter((t) => t.isActive).map((t) => ({ id: t.id, templateType: t.templateType, title: t.title, responseText: t.responseText }))} />}
      </Card>

      {manage && (
        <Card>
          <SectionTitle>⚙️ Manage templates (Boss / HR)</SectionTitle>
          <p className="mb-2 text-xs text-ink-muted">Add your own templates for the team to copy &amp; paste — use {"{placeholders}"} for the parts staff fill in each time.</p>
          <TemplateManager templates={templates.map((t) => ({ id: t.id, templateType: t.templateType, title: t.title, responseText: t.responseText, departmentEligibility: t.departmentEligibility, isActive: t.isActive }))} />
        </Card>
      )}
    </>
  );
}
