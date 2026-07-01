"use client";

import { useState } from "react";
import { updateMyProfile } from "@/app/(app)/users/actions";

export function MyProfileForm({ phoneNumber, avatarUrl }: { phoneNumber: string | null; avatarUrl: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      action={async (fd) => { setMsg(null); setOk(false); try { await updateMyProfile(fd); setOk(true); } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div><label className="label">Phone number</label><input name="phoneNumber" className="input" defaultValue={phoneNumber ?? ""} /></div>
      <div><label className="label">Avatar URL</label><input name="avatarUrl" className="input" defaultValue={avatarUrl ?? ""} placeholder="https://…" /></div>
      <div className="sm:col-span-2 mt-2 border-t border-slate-100 pt-3 text-xs font-semibold uppercase text-ink-muted">Change password (optional)</div>
      <div><label className="label">New password</label><input name="password" type="password" className="input" autoComplete="new-password" /></div>
      <div><label className="label">Confirm password</label><input name="confirm" type="password" className="input" autoComplete="new-password" /></div>
      <p className="text-xs text-ink-muted sm:col-span-2">Leave password blank to keep your current one. Min 8 chars, one uppercase, one number.</p>
      {msg && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{msg}</div>}
      {ok && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 sm:col-span-2">Profile updated successfully.</div>}
      <div className="sm:col-span-2"><button className="btn-primary" type="submit">Save my profile</button></div>
    </form>
  );
}
