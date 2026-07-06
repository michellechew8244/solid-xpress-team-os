"use client";

import { useRef, useState, useTransition } from "react";
import { signUp } from "@/app/signup/actions";
import { FileDropZone } from "@/components/FileDropZone";
import { dobFromIC } from "@/lib/ic";

/** Downscale a photo in the browser (max 1280px, JPEG) so phone selfies of
 *  4–8MB never hit the server's 3MB limit. Falls back to the original file. */
async function compressPhoto(file: File): Promise<File> {
  try {
    if (file.size <= 1024 * 1024) return file; // already small
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name.replace(/\.\w+$/, "") || "photo") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // any failure → send the original and let the server validate
  }
}

export function SignupForm({ departments }: { departments: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dob, setDob] = useState("");
  const [dobAuto, setDobAuto] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  // Shortcut: typing the IC auto-fills the date of birth (first 6 digits).
  function onIcChange(v: string) {
    const parsed = dobFromIC(v);
    if (parsed && (dob === "" || dobAuto)) { setDob(parsed); setDobAuto(true); }
  }

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
        // Auto-compress large phone photos so size never blocks a sign-up.
        fd.set("photo", await compressPhoto(photo));
        try {
          const res = await signUp(fd);
          if (res.ok) setDone(true);
          else setErr(res.error);
        } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong — please try again."); }
      })}
      className="grid gap-3 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        {/* No `capture` attr: phones then offer BOTH camera and gallery. */}
        <FileDropZone name="photo" accept="image/png,image/jpeg,image/webp" label="📷 Your photo * (this becomes your avatar)" hint="Take a selfie or choose from your gallery — large photos are compressed automatically" />
      </div>
      <div className="sm:col-span-2"><label className="label">Full name *</label><input name="name" className="input" required /></div>
      <div><label className="label">Email *</label><input name="email" type="email" className="input" required /></div>
      <div><label className="label">Phone</label><input name="phoneNumber" className="input" placeholder="+60…" /></div>
      <div>
        <label className="label">IC / ID number *</label>
        <input name="nationalId" className="input" placeholder="e.g. 950311-14-5566" onChange={(e) => onIcChange(e.target.value)} required />
      </div>
      <div>
        <label className="label">Date of birth *</label>
        <input name="dateOfBirth" type="date" className="input" value={dob} onChange={(e) => { setDob(e.target.value); setDobAuto(false); }} required />
        <div className="mt-0.5 text-[11px] text-ink-muted">{dobAuto ? "✨ Filled from your IC — correct it if needed" : "Shortcut: type your IC above and this fills itself"}</div>
      </div>
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
