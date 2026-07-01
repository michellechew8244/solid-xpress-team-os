"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ROLE_LABELS } from "@/lib/enums";
import { EMPLOYMENT_STATUSES, ACCESS_STATUSES } from "@/lib/user-permissions";

export function UserFilters({ departments, roles }: { departments: { id: string; name: string }[]; roles: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function set(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
      <input
        className="input lg:col-span-2"
        placeholder="Search name, email, code…"
        defaultValue={sp.get("q") ?? ""}
        onChange={(e) => set("q", e.target.value)}
      />
      <select className="input" value={sp.get("dept") ?? ""} onChange={(e) => set("dept", e.target.value)}>
        <option value="">All departments</option>
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select className="input" value={sp.get("role") ?? ""} onChange={(e) => set("role", e.target.value)}>
        <option value="">All roles</option>
        {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
      </select>
      <select className="input" value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
        <option value="">All employment</option>
        {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="input" value={sp.get("access") ?? ""} onChange={(e) => set("access", e.target.value)}>
        <option value="">All access</option>
        {ACCESS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
