"use client";

import { useRef, useState, useTransition } from "react";
import { signUp } from "@/app/signup/actions";
import { FileDropZone } from "@/components/FileDropZone";

export function SignupForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  if (done) {
    return (
      <div className="rounded-xl bg-green-50 p-6 text-center">
        <div className="text-4xl">🎉</div>
        <h2 className="mt-2 font-bold text-green-800">Registration submitted!</h2>
        <p className="mt-1 text-sm text-green-700">
          Management has been notified and will review your sign-up. You&apos;ll be able to log in once your account is approved.
        </p>
      </div>
    );
  }

  return (
    <form
      ref={ref}
      action={(fd) => start(async () => {
        setErr(null);
        // Photo is required — it becomes the staff avatar. Check before submitting.
        const photo = fd.get("photo");
        if (!(photo instanceof File) || photo.size === 0) { setErr("Please take a photo (or choose one) — it becomes your avatar in the app. 📷"); return; }
        try {
          const res = await signUp(fd);
          if (res.ok) setDone(true);
          else setErr(res.error);
        } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong — please try again."); }
      })}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <FileDropZone name="photo" accept="image/png,image/jpeg,image/webp" capture="user" label="📷 Your photo * (this becomes your avatar)" hint="Tap to open the camera and take a selfie · max 3MB" />
      </div>
      <div className="sm:col-span-2"><label className="label">Full name *</label><input name="name" className="input" required /></div>
      <div><label className="label">Email *</label><input name="email" type="email" className="input" required /></div>
      <div><label className="label">Phone</label><input name="phoneNumber" className="input" placeholder="+60…" /></div>
      <div><label className="label">Date of birth *</label><input name="dateOfBirth" type="date" className="input" required /></div>
      <div><label className="label">IC / ID number *</label><input name="nationalId" className="input" required /></div>
      <div className="sm:col-span-2">
        <label className="label">Department</label>
        <select name="departmentId" className="input"><option value="">— not sure yet —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      </div>
      <div><label className="label">Password *</label><input name="password" type="password" className="input" required /></div>
      <div><label className="label">Confirm password *</label><input name="confirm" type="password" className="input" required /></div>
      {err && <div className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <div className="sm:col-span-2">
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Submitting…" : "Create my account"}</button>
      </div>
    </form>
  );
}
