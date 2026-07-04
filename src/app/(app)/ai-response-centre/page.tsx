import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { ResponseCentre } from "@/components/ResponseCentre";
import { seedResponseTemplates } from "./actions";

export default async function ResponseCentrePage() {
  const me = await getCurrentUser();
  if (!me) return null;

  const templates = await prisma.aIResponseTemplate.findMany({ where: { isActive: true }, orderBy: { title: "asc" } });

  return (
    <>
      <PageHeader
        title="✉️ AI Response Centre"
        subtitle="Professional drafts for customer and internal messages — customs inquiries, closing reminders, new lead replies, shipment updates."
        action={isBoss(me.role) && templates.length === 0 ? (
          <form action={async () => { "use server"; await seedResponseTemplates(); }}>
            <button className="btn-primary">Load standard templates</button>
          </form>
        ) : undefined}
      />

      <Card>
        <SectionTitle>Draft a message</SectionTitle>
        {templates.length === 0
          ? <p className="text-sm text-ink-muted">No templates yet{isBoss(me.role) ? " — load the standard set with the button above" : " — ask management to load them"}.</p>
          : <ResponseCentre templates={templates.map((t) => ({ id: t.id, templateType: t.templateType, title: t.title, responseText: t.responseText }))} />}
      </Card>
    </>
  );
}
