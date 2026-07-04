"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeOwnPassword } from "@/app/change-password/actions";

export function ChangePasswordForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      action={(fd) => start(async () => {
        setErr(null);
        try {
          const res = await changeOwnPassword(fd);
          if (!res.ok) { setErr(res.error); return; }
          router.replace("/dashboard"); router.refresh();
        } catch { setErr("Something went wrong — please try again."); }
      })}
      className="space-y-4"
    >
      <div>
        <label className="label">Current (temporary) password</label>
        <input name="current" type="password" className="input" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label">New password</label>
        <input name="password" type="password" className="input" autoComplete="new-password" required />
        <p className="mt-1 text-xs text-ink-muted">At least 8 characters, with letters and numbers.</p>
      </div>
      <div>
        <label className="label">Confirm new password</label>
        <input name="confirm" type="password" className="input" autoComplete="new-password" required />
      </div>
      {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Set password & continue"}</button>
    </form>
  );
}
