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
