/** UI formatting helpers. */

export function rm(amount: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

export function shortDate(d?: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-MY", { day: "2-digit", month: "short" });
}

export function dateTime(d?: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Traffic-light status from an achievement percentage. */
export function ragFromPct(p: number): "ok" | "warn" | "danger" {
  if (p >= 90) return "ok";
  if (p >= 70) return "warn";
  return "danger";
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function isOverdue(deadline?: Date | string | null, status?: string): boolean {
  if (!deadline || status === "COMPLETED" || status === "REJECTED") return false;
  return new Date(deadline).getTime() < Date.now();
}

/**
 * Mask a sensitive ID (IC / passport) to only its last 4 characters, e.g.
 * "990101-14-5555" → "••••••••5555". PDPA data-minimisation: the full number is
 * kept in the database but never rendered in the UI.
 */
export function maskId(id?: string | null): string | null {
  if (!id) return null;
  const trimmed = id.replace(/\s/g, "");
  if (trimmed.length <= 4) return "••••";
  return "•".repeat(Math.min(8, trimmed.length - 4)) + trimmed.slice(-4);
}
