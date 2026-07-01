import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runAssistant } from "@/lib/ai";

/**
 * AI assistant endpoint (section J). Builds a scope-specific prompt + an
 * offline fallback so the feature works with or without an API key.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scope, context } = await req.json();
  const ctx = JSON.stringify(context ?? {}, null, 2);

  const system =
    "You are the Solid Xpress Team OS assistant for a Malaysian logistics company. " +
    "Be concise, practical and motivating. Use short bullet points. " +
    "You assist only and never make final approval decisions — defer those to the human manager.";

  let userPrompt = "";
  let fallback = () => "Summary unavailable.";

  switch (scope) {
    case "boss":
      userPrompt = `Summarise this week's company performance and recommend management focus for next week.\nData:\n${ctx}`;
      fallback = () => bossFallback(context);
      break;
    case "staff":
      userPrompt = `Suggest today's top priorities and one improvement tip for this staff member.\nData:\n${ctx}`;
      fallback = () => staffFallback(context);
      break;
    case "department":
      userPrompt = `Generate a short weekly department review with priorities and blockers.\nData:\n${ctx}`;
      fallback = () => deptFallback(context);
      break;
    case "daily-report":
      userPrompt = `Rewrite these raw daily-report notes into a short, professional summary.\nNotes:\n${ctx}`;
      fallback = () => "Professional summary:\n• Completed assigned tasks and customer updates.\n• Pending items flagged for follow-up.\n• Priorities set for tomorrow.";
      break;
    default:
      userPrompt = `Summarise the following:\n${ctx}`;
  }

  const result = await runAssistant(system, userPrompt, fallback);
  return NextResponse.json(result);
}

/* ---- Offline fallback generators (deterministic, data-driven) ---- */

function bossFallback(c: any): string {
  const lines = [
    `📊 Company performance this week:`,
    `• Revenue at ${c?.revenuePct ?? 0}% of target; gross profit at ${c?.gpPct ?? 0}%.`,
    `• ${c?.overdue ?? 0} overdue tasks and ${c?.complaints ?? 0} open customer complaints.`,
  ];
  if (c?.weakDepartments?.length) lines.push(`• Weak departments to watch: ${c.weakDepartments.join(", ")}.`);
  if (c?.bottomStaff?.length) lines.push(`• Staff needing coaching: ${c.bottomStaff.join(", ")}.`);
  lines.push(``, `🎯 Recommended focus next week:`, `• Clear overdue tasks in red departments first.`, `• Set coaching sessions for bottom performers.`, `• Push billing & collection to improve cash flow.`);
  return lines.join("\n");
}

function staffFallback(c: any): string {
  const lines = [`🎯 Suggested priorities today:`];
  if (c?.urgentTasks?.length) lines.push(...c.urgentTasks.slice(0, 3).map((t: string) => `• ${t}`));
  else lines.push(`• Clear any overdue or high-priority missions.`, `• Update shipment milestones.`, `• Follow up pending customer items.`);
  lines.push(``, `💡 Improvement tip: complete tasks before deadline and upload proof to earn full points and avoid penalties.`);
  return lines.join("\n");
}

function deptFallback(c: any): string {
  return [
    `📋 Weekly department review:`,
    `• KPI achievement around ${c?.kpiPct ?? 0}%.`,
    `• ${c?.overdue ?? 0} overdue tasks to resolve.`,
    `• Blockers: ${(c?.blockers ?? []).join("; ") || "none reported"}.`,
    ``,
    `Next steps: prioritise overdue items, coach lagging staff, and keep milestones updated daily.`,
  ].join("\n");
}
