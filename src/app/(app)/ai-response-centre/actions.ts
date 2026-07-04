"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isBoss } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

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
