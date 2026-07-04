"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ROLE_LABELS } from "@/lib/enums";
import { EMPLOYMENT_TYPES, EMPLOYMENT_STATUSES } from "@/lib/user-permissions";
import { updateUser, resetUserPassword, deactivateUser, reactivateUser } from "@/app/(app)/users/actions";

type Person = { id: string; name: string };

export interface RowUser {
  id: string;
  name: string;
  email: string;
  employeeCode: string | null;
  role: string;
  jobTitle: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
  dateOfBirth: string | null; // "YYYY-MM-DD" for the date input
  departmentId: string | null;
  managerId: string | null;
  employmentType: string;
  employmentStatus: string;
  accessStatus: string;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function UserRowActions({
  user,
  scope,
  canReset,
  canToggle,
  departments,
  managers,
  roles,
}: {
  user: RowUser;
  scope: "full" | "limited" | "none";
  canReset: boolean;
  canToggle: boolean;
  departments: Person[];
  managers: Person[];
  roles: string[];
}) {
  const [modal, setModal] = useState<null | "edit" | "reset" | "deactivate">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = user.accessStatus === "ACTIVE";

  return (
    <div className="flex items-center justify-end gap-1">
      <Link href={`/users/${user.id}`} className="btn-ghost px-2 py-1 text-xs" title="View profile">View</Link>
      {scope !== "none" && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setModal("edit")}>Edit</button>}
      {canReset && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setModal("reset")}>Reset PW</button>}
      {canToggle && (
        active
          ? <button className="btn-ghost px-2 py-1 text-xs text-danger" onClick={() => setModal("deactivate")}>Deactivate</button>
          : <button className="btn-ghost px-2 py-1 text-xs text-ok" disabled={pending} onClick={() => start(() => reactivateUser(user.id))}>Reactivate</button>
      )}

      {modal === "edit" && (
        <Modal title={`Edit ${user.name}`} onClose={() => setModal(null)}>
          <form
            action={async (fd) => { setMsg(null); try { await updateUser(fd); setModal(null); } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={user.id} />
            {scope === "full" && (
              <>
                <div><label className="label">Full name</label><input name="name" className="input" defaultValue={user.name} /></div>
                <div><label className="label">Employee code</label><input name="employeeCode" className="input" defaultValue={user.employeeCode ?? ""} /></div>
              </>
            )}
            <div><label className="label">Job title</label><input name="jobTitle" className="input" defaultValue={user.jobTitle ?? ""} /></div>
            <div><label className="label">Phone</label><input name="phoneNumber" className="input" defaultValue={user.phoneNumber ?? ""} /></div>
            <div><label className="label">🎂 Date of birth</label><input name="dateOfBirth" type="date" className="input" defaultValue={user.dateOfBirth ?? ""} /></div>
            {scope === "full" && (
              <>
                <div>
                  <label className="label">Role</label>
                  <select name="role" className="input" defaultValue={user.role}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}</select>
                </div>
                <div>
                  <label className="label">Department</label>
                  <select name="departmentId" className="input" defaultValue={user.departmentId ?? ""}><option value="">— none —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                </div>
                <div>
                  <label className="label">Reporting manager</label>
                  <select name="managerId" className="input" defaultValue={user.managerId ?? ""}><option value="">— none —</option>{managers.filter((m) => m.id !== user.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                </div>
                <div>
                  <label className="label">Employment type</label>
                  <select name="employmentType" className="input" defaultValue={user.employmentType}>{EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select>
                </div>
                <div>
                  <label className="label">Employment status</label>
                  <select name="employmentStatus" className="input" defaultValue={user.employmentStatus}>{EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                </div>
              </>
            )}
            <div className="sm:col-span-2"><label className="label">Avatar URL</label><input name="avatarUrl" className="input" defaultValue={user.avatarUrl ?? ""} /></div>
            {msg && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{msg}</div>}
            {scope === "limited" && <p className="text-xs text-ink-muted sm:col-span-2">You can edit job title, phone and avatar for this user.</p>}
            <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Save changes</button><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}

      {modal === "reset" && (
        <Modal title={`Reset password — ${user.name}`} onClose={() => setModal(null)}>
          <form
            action={async (fd) => { setMsg(null); try { await resetUserPassword(fd); setModal(null); } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } }}
            className="space-y-3"
          >
            <input type="hidden" name="id" value={user.id} />
            <div><label className="label">New password</label><input name="password" type="password" className="input" required /></div>
            <div><label className="label">Confirm password</label><input name="confirm" type="password" className="input" required /></div>
            <p className="text-xs text-ink-muted">Min 8 chars, at least one uppercase letter and one number.</p>
            {msg && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</div>}
            <div className="flex gap-2"><button className="btn-primary">Update password</button><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancel</button></div>
          </form>
        </Modal>
      )}

      {modal === "deactivate" && (
        <Modal title="Deactivate user" onClose={() => setModal(null)}>
          <p className="text-sm text-ink-soft">
            Are you sure you want to deactivate <strong>{user.name}</strong>? They will no longer be able to log in,
            but all historical records (KPI, points, rewards, badges, reviews) will be kept.
          </p>
          <div className="mt-4 flex gap-2">
            <button className="btn-danger" disabled={pending} onClick={() => start(async () => { await deactivateUser(user.id); setModal(null); })}>Yes, deactivate</button>
            <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
