import { initials } from "@/lib/format";

/** Coloured avatar circle from a name + colour. */
export function Avatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: color ?? "#1b45d6", width: size, height: size, fontSize: size * 0.38 }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

/** Generic card container. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">{children}</h2>
      {action}
    </div>
  );
}

/** KPI / metric card with optional traffic-light accent. */
export function StatCard({
  label,
  value,
  sub,
  rag,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  rag?: "ok" | "warn" | "danger" | "neutral";
  icon?: React.ReactNode;
}) {
  const ragColor =
    rag === "ok"
      ? "border-l-ok"
      : rag === "warn"
        ? "border-l-warn"
        : rag === "danger"
          ? "border-l-danger"
          : "border-l-brand-400";
  return (
    <div className={`card border-l-4 ${ragColor} p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
          <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
          {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
        </div>
        {icon && <div className="text-2xl">{icon}</div>}
      </div>
    </div>
  );
}

/** Horizontal progress bar with RAG colour. */
export function Progress({ value, rag }: { value: number; rag?: "ok" | "warn" | "danger" }) {
  const v = Math.max(0, Math.min(value, 100));
  const color = rag === "ok" ? "bg-ok" : rag === "warn" ? "bg-warn" : rag === "danger" ? "bg-danger" : "bg-brand-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

const PILL_STYLES: Record<string, string> = {
  // task statuses
  NOT_STARTED: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  WAITING_EXTERNAL: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-green-100 text-green-700",
  REJECTED: "bg-rose-100 text-rose-700",
  OVERDUE: "bg-red-100 text-red-700",
  // priority
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-sky-100 text-sky-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
  // generic
  OK: "bg-green-100 text-green-700",
  WARN: "bg-amber-100 text-amber-700",
  DANGER: "bg-red-100 text-red-700",
};

export function Pill({ value, label }: { value: string; label?: string }) {
  return <span className={`badge ${PILL_STYLES[value] ?? "bg-slate-100 text-slate-600"}`}>{label ?? value}</span>;
}

export function RagDot({ rag }: { rag: "ok" | "warn" | "danger" }) {
  const c = rag === "ok" ? "bg-ok" : rag === "warn" ? "bg-warn" : "bg-danger";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${c}`} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-1 p-10 text-center">
      <div className="text-3xl">🗂️</div>
      <div className="font-semibold text-ink">{title}</div>
      {hint && <div className="text-sm text-ink-muted">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {/* Full width on mobile so expanding create/award forms have room. */}
      {action && <div className="w-full sm:w-auto">{action}</div>}
    </div>
  );
}
