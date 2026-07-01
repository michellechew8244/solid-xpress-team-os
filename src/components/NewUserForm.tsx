"use client";

import { useRef, useState } from "react";
import { ROLE_LABELS } from "@/lib/enums";
import { EMPLOYMENT_TYPES, EMPLOYMENT_STATUSES } from "@/lib/user-permissions";
import { createUser } from "@/app/(app)/users/actions";

type Person = { id: string; name: string };

export function NewUserForm({ departments, managers, roles }: { departments: Person[]; managers: Person[]; roles: string[] }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <div>
      <button className="btn-primary w-full sm:w-auto" onClick={() => setOpen((o) => !o)}>＋ Add Staff</button>
      {open && (
        <form
          ref={ref}
          action={async (fd) => { setErr(null); try { await createUser(fd); ref.current?.reset(); setOpen(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }}
          className="card mt-3 grid gap-3 p-4 sm:grid-cols-2"
        >
          <div><label className="label">Full name *</label><input name="name" className="input" required /></div>
          <div><label className="label">Email *</label><input name="email" type="email" className="input" required /></div>
          <div><label className="label">Employee code</label><input name="employeeCode" className="input" placeholder="SX-0007" /></div>
          <div><label className="label">Temp password *</label><input name="password" className="input" defaultValue="Password123" required /></div>
          <div>
            <label className="label">Role *</label>
            <select name="role" className="input" defaultValue="STAFF">{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}</select>
          </div>
          <div>
            <label className="label">Department *</label>
            <select name="departmentId" className="input" required><option value="">— select —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </div>
          <div><label className="label">Job title</label><input name="jobTitle" className="input" /></div>
          <div>
            <label className="label">Reporting manager</label>
            <select name="managerId" className="input"><option value="">— none —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </div>
          <div><label className="label">Phone</label><input name="phoneNumber" className="input" /></div>
          <div><label className="label">Join date</label><input name="joinDate" type="date" className="input" /></div>
          <div>
            <label className="label">Employment type</label>
            <select name="employmentType" className="input" defaultValue="FULL_TIME">{EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
          </div>
          <div>
            <label className="label">Employment status</label>
            <select name="employmentStatus" className="input" defaultValue="PROBATION">{EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <div className="sm:col-span-2"><label className="label">Avatar URL (optional)</label><input name="avatarUrl" className="input" placeholder="https://…" /></div>
          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{err}</div>}
          <div className="flex items-end gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit">Create User</button>
            <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
