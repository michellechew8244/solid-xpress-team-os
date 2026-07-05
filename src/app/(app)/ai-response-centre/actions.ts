"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { composeReply, claudeDraft, claudeConfigured, INTENT_LABELS, type Tone } from "@/lib/ai-reply";
import { currentPeriod } from "@/lib/enums";

export type DraftResult = { ok: true; draft: string; intentLabel: string; tips: string[]; engine: "claude" | "builtin" } | { ok: false; error: string };

/** Staff paste a customer message → get a reply draft (Claude if configured, built-in otherwise). */
export async function draftCustomerReply(fd: FormData): Promise<DraftResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const message = String(fd.get("message") ?? "").trim();
  const tone = (["PROFESSIONAL", "FRIENDLY", "APOLOGETIC"].includes(String(fd.get("tone"))) ? String(fd.get("tone")) : "PROFESSIONAL") as Tone;
  const context = String(fd.get("context") ?? "").trim();
  if (!message) return { ok: false, error: "Paste the customer's message first." };
  if (message.length > 6000) return { ok: false, error: "Message is too long — paste the key part (max 6000 characters)." };

  const builtin = composeReply(message, tone);
  const ai = await claudeDraft("CUSTOMER_REPLY", message, [`Tone: ${tone}.`, context ? `Extra context from staff: ${context}` : "", `Detected topic: ${builtin.intent}.`].filter(Boolean).join(" "));
  const draft = ai ?? builtin.draft;

  await prisma.aIAnalysisLog.create({
    data: { analysisType: "CS_REPLY_DRAFT", month: currentPeriod(), outputText: draft.slice(0, 4000), generatedBy: s.id, inputDataJson: JSON.stringify({ intent: builtin.intent, tone, engine: ai ? "claude" : "builtin" }) },
  });
  return { ok: true, draft, intentLabel: INTENT_LABELS[builtin.intent], tips: builtin.tips, engine: ai ? "claude" : "builtin" };
}

/** Sales: draft a follow-up/closing message from a playbook + situation. */
export async function draftSalesMessage(fd: FormData): Promise<DraftResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const situation = String(fd.get("situation") ?? "").trim();
  const script = String(fd.get("script") ?? "");
  if (!situation && !script) return { ok: false, error: "Describe the situation first." };

  const ai = situation
    ? await claudeDraft("SALES_MESSAGE", situation, script ? `Base playbook script to adapt:\n${script}` : "")
    : null;
  const draft = ai ?? script;
  if (!draft) return { ok: false, error: "No draft available." };

  await prisma.aIAnalysisLog.create({
    data: { analysisType: "SALES_DRAFT", month: currentPeriod(), outputText: draft.slice(0, 4000), generatedBy: s.id },
  });
  return { ok: true, draft, intentLabel: "🤝 Sales message", tips: [], engine: ai ? "claude" : "builtin" };
}

export async function isClaudeConfigured(): Promise<boolean> {
  return claudeConfigured();
}

/**
 * Operation status update: drafts a shipment update from the job's REAL data
 * (milestones, vessel, ETD/ETA, container) — nothing invented. Audience:
 * customer message or internal CS handover.
 */
export async function draftOpsStatusUpdate(fd: FormData): Promise<DraftResult> {
  const s = await getSession();
  if (!s) return { ok: false, error: "Please log in again." };
  const jobId = String(fd.get("jobId") ?? "");
  const audience = String(fd.get("audience")) === "INTERNAL" ? "INTERNAL" : "CUSTOMER";
  const note = String(fd.get("note") ?? "").trim();
  if (!jobId) return { ok: false, error: "Pick a job first." };

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { customer: { select: { name: true } }, milestones: { orderBy: { order: "asc" } } },
  });
  if (!job) return { ok: false, error: "Job not found." };

  const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d) : null);
  const done = job.milestones.filter((m) => m.done);
  const current = done.length ? done[done.length - 1].label : "Job created";
  const next = job.milestones.find((m) => !m.done)?.label ?? null;

  const facts: string[] = [];
  if (job.vesselName) facts.push(`Vessel: ${job.vesselName}${job.voyage ? ` V.${job.voyage}` : ""}`);
  if (job.containerNumber) facts.push(`Container: ${job.containerNumber}`);
  if (fmt(job.etd)) facts.push(`ETD: ${fmt(job.etd)}`);
  if (fmt(job.eta)) facts.push(`ETA: ${fmt(job.eta)}`);
  if (fmt(job.closingDate)) facts.push(`Closing: ${fmt(job.closingDate)}`);

  const builtin = audience === "CUSTOMER"
    ? [
        `Dear ${job.customer?.name ?? "{customerName}"},`,
        ``,
        `Update on ${job.jobNumber}${job.pol && job.pod ? ` (${job.pol} → ${job.pod})` : ""}:`,
        `• Current status: ${current} ✅`,
        ...(next ? [`• Next step: ${next}`] : []),
        ...(facts.length ? [`• ${facts.join(" · ")}`] : []),
        ...(note ? [`• Note: ${note}`] : []),
        ``,
        `We will update you at the next milestone. Let us know if you need anything.`,
        ``,
        `Thank you.`,
        `Solid Xpress M Sdn Bhd`,
      ].join("\n")
    : [
        `Hi CS Team,`,
        ``,
        `Status handover for ${job.jobNumber}${job.customer ? ` (${job.customer.name})` : ""}:`,
        `• Done: ${done.length ? done.map((m) => m.label).join(" → ") : "job created only"}`,
        ...(next ? [`• Next: ${next}`] : []),
        ...(facts.length ? [`• ${facts.join(" · ")}`] : []),
        ...(note ? [`• Note: ${note}`] : []),
        ``,
        `Please update the customer accordingly. Ping me if anything is unclear.`,
      ].join("\n");

  // Optional Claude polish, grounded strictly in the real facts above.
  const ai = note || audience === "CUSTOMER"
    ? await claudeDraft(
        "CUSTOMER_REPLY",
        `Draft a ${audience === "CUSTOMER" ? "customer shipment status update" : "short internal handover message to the CS team"} using ONLY these facts (do not add or change any):\n${builtin}`,
        "Keep every fact exactly as given.",
      )
    : null;

  await prisma.aIAnalysisLog.create({
    data: { analysisType: "OPS_STATUS_DRAFT", month: currentPeriod(), outputText: (ai ?? builtin).slice(0, 4000), generatedBy: s.id, inputDataJson: JSON.stringify({ jobId, audience, engine: ai ? "claude" : "builtin" }) },
  });
  return {
    ok: true,
    draft: ai ?? builtin,
    intentLabel: audience === "CUSTOMER" ? "🚢 Customer status update" : "🔁 Internal CS handover",
    tips: [
      "Proactive updates count for your KPI — a missed milestone update is a −20 💎 deduction.",
      "Log this as a MILESTONE_UPDATE / SHIPMENT_STATUS_UPDATE job record.",
    ],
    engine: ai ? "claude" : "builtin",
  };
}

export type TemplateResult = { ok: true } | { ok: false; error: string };

/** Boss/HR add or edit a reusable copy-paste template. */
export async function saveTemplate(fd: FormData): Promise<TemplateResult> {
  const s = await getSession();
  if (!s || (!isBoss(s.role) && s.role !== "HR_ADMIN")) return { ok: false, error: "Only Boss / HR can manage templates." };
  const id = String(fd.get("id") ?? "");
  const data = {
    title: String(fd.get("title") ?? "").trim(),
    templateType: String(fd.get("templateType") ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_") || "CUSTOM",
    responseText: String(fd.get("responseText") ?? "").trim(),
    departmentEligibility: String(fd.get("departmentEligibility") ?? "ALL") || "ALL",
    isActive: fd.get("isActive") !== "off",
  };
  if (!data.title) return { ok: false, error: "Template title is required." };
  if (!data.responseText) return { ok: false, error: "Template text is required. Use {placeholders} for the parts staff fill in." };
  if (id) await prisma.aIResponseTemplate.update({ where: { id }, data });
  else await prisma.aIResponseTemplate.create({ data });
  revalidatePath("/ai-response-centre");
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<TemplateResult> {
  const s = await getSession();
  if (!s || (!isBoss(s.role) && s.role !== "HR_ADMIN")) return { ok: false, error: "Only Boss / HR can delete templates." };
  await prisma.aIResponseTemplate.delete({ where: { id } });
  revalidatePath("/ai-response-centre");
  return { ok: true };
}

/** Seed the four spec templates (idempotent by templateType). */
export async function seedResponseTemplates() {
  const s = await getSession();
  if (!s || !isBoss(s.role)) throw new Error("Only Boss / Management can seed templates.");
  const templates = [
    {
      templateType: "CUSTOMS_INQUIRY", title: "Customer customs inquiry response",
      responseText: "Dear {customerName},\n\nThank you for your inquiry. We are checking the customs requirement for {commodity / jobNo}. We will verify the HS code, permit requirement and duty/tax details with our forwarding team and update you by {time}.\n\nThank you.\nSolid Xpress M Sdn Bhd",
    },
    {
      templateType: "CLOSING_REMINDER", title: "Closing date reminder",
      responseText: "Dear {customerName},\n\nKindly note that the closing date for {vessel / jobNo} is {closingDate}. To avoid shipment delay, please provide the pending documents by {deadline}.\n\nThank you.\nSolid Xpress M Sdn Bhd",
    },
    {
      templateType: "INTERNAL_FORWARDING", title: "Internal request to Forwarding team",
      responseText: "Hi Forwarding Team,\n\nCustomer has requested customs advice for Job {jobNo}.\nCommodity: {commodity}\nInquiry: {inquiry}\n\nPlease help to check HS code / permit / duty-tax / customs requirement and update CS by {deadline}. Thank you!",
    },
    {
      templateType: "NEW_LEAD_ACK", title: "New lead acknowledgement",
      responseText: "Dear {customerName},\n\nThank you for your inquiry. To assist you accurately, kindly provide:\n• Shipment mode (sea / air / land)\n• POL (port of loading)\n• POD (port of discharge)\n• Commodity\n• Volume / weight\n• Cargo ready date\n• Any permit concern\n\nOur team will review and advise the suitable logistics solution.\n\nBest regards,\nSolid Xpress M Sdn Bhd",
    },
    {
      templateType: "SHIPMENT_UPDATE", title: "Proactive shipment status update",
      responseText: "Dear {customerName},\n\nShipment update for {jobNo}:\nStatus: {status}\nETA/ETD: {etaEtd}\nNext step: {nextStep}\n\nWe will keep you posted. Please let us know if you need anything else.\n\nThank you.\nSolid Xpress M Sdn Bhd",
    },
    {
      templateType: "DELAY_EXPLANATION", title: "Delay explanation (external cause)",
      responseText: "Dear {customerName},\n\nWe would like to update you that {jobNo} is affected by {externalCause} (outside our control). The current expected timeline is {newTimeline}.\n\nWe are monitoring closely and will update you as soon as the situation changes. We apologise for the inconvenience and thank you for your understanding.\n\nSolid Xpress M Sdn Bhd",
    },
  ];
  for (const t of templates) {
    const exists = await prisma.aIResponseTemplate.findFirst({ where: { templateType: t.templateType } });
    if (!exists) await prisma.aIResponseTemplate.create({ data: t });
  }
  revalidatePath("/ai-response-centre");
}
