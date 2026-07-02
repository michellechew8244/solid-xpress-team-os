"use client";

import { useRef, useState, useTransition } from "react";
import { createWish, approveWish, rejectWish, submitWishProof, decideWishOutcome } from "@/app/(app)/wishing-tree/actions";
import { uploadProofPhoto } from "@/lib/upload-client";
import { FileDropZone } from "@/components/FileDropZone";

const EMOJIS = ["🌟", "🎁", "🏖️", "📱", "🍜", "🎮", "🚗", "💰", "🎓", "❤️"];

export function NewWishForm() {
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState("🌟");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>🌱 Make a Wish</button>
      {open && (
        <form
          ref={ref}
          action={(fd) => { setErr(null); fd.set("emoji", emoji); start(async () => { try { await createWish(fd); ref.current?.reset(); setEmoji("🌟"); setOpen(false); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}
          className="card mt-3 grid gap-3 p-4"
        >
          <div>
            <label className="label">Pick an icon</label>
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((e) => (
                <button type="button" key={e} onClick={() => setEmoji(e)} className={`rounded-lg px-2 py-1 text-xl ${emoji === e ? "bg-brand-100 ring-2 ring-brand-400" : "bg-slate-50 hover:bg-slate-100"}`}>{e}</button>
              ))}
            </div>
          </div>
          <div><label className="label">My wish *</label><input name="title" className="input" placeholder="e.g. A day off for my birthday" required /></div>
          <div><label className="label">Details (optional)</label><input name="description" className="input" /></div>
          <div>
            <label className="label">🎯 My Mission Impossible challenge *</label>
            <textarea name="challenge" className="input min-h-20" placeholder="e.g. Close 15 shipments with zero customer complaints this month" required />
            <p className="mt-1 text-xs text-ink-muted">Set yourself a bold, measurable challenge. The Boss approves it, you complete it, then submit proof to claim your wish.</p>
          </div>
          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <div className="flex gap-2"><button className="btn-primary" disabled={pending}>{pending ? "Planting…" : "Plant on the tree"}</button><button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function BossWishDecision({ wishId }: { wishId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap gap-1">
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => start(async () => { try { await approveWish(wishId); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}>Approve challenge</button>
      <button className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending} onClick={() => { const n = window.prompt("Reason for rejecting this wish?") ?? ""; start(async () => { try { await rejectWish(wishId, n); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}>Reject</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}

export function BossWishOutcome({ wishId }: { wishId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap gap-1">
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={() => { const n = window.prompt("Add a congratulations note (optional):") ?? ""; start(async () => { try { await decideWishOutcome(wishId, true, n); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}>🎉 Grant wish</button>
      <button className="btn-ghost px-3 py-1 text-xs text-danger" disabled={pending} onClick={() => { const n = window.prompt("Why didn't the challenge pass?") ?? ""; start(async () => { try { await decideWishOutcome(wishId, false, n); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } }); }}>Not passed</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}

export function SubmitProofForm({ wishId }: { wishId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div>
      <button className="btn-primary px-3 py-1 text-xs" onClick={() => setOpen((o) => !o)}>🏁 Submit challenge proof</button>
      {open && (
        <form
          ref={ref}
          action={(fd) => start(async () => {
            setErr(null);
            try {
              const file = fd.get("proof");
              fd.delete("proof");
              if (file instanceof File && file.size > 0) {
                const url = await uploadProofPhoto(file);
                if (!url) throw new Error("Photo upload isn't available right now.");
                fd.set("evidenceUrl", url);
              }
              await submitWishProof(fd);
              ref.current?.reset(); setOpen(false);
            } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
          })}
          className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3"
        >
          <input type="hidden" name="wishId" value={wishId} />
          <FileDropZone name="proof" accept="image/png,image/jpeg,image/webp,application/pdf" capture="environment" label="Proof of challenge" hint="photo/screenshot/PDF · drag & drop" />
          {err && <div className="rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">{err}</div>}
          <div className="flex gap-2"><button className="btn-primary px-3 py-1 text-xs" disabled={pending}>{pending ? "Submitting…" : "Submit"}</button><button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}
