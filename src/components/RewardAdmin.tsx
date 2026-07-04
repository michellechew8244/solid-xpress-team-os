"use client";

import { useState, useTransition } from "react";
import { createReward, updateReward, deleteReward } from "@/app/(app)/rewards/actions";

export type RewardItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  pointsCost: number;
  stock: number;
  imageEmoji: string;
  isActive: boolean;
};

const CATEGORIES = [
  "CASH_VOUCHER", "MEAL_VOUCHER", "EXTRA_LEAVE", "COMPANY_GIFT", "TRAINING",
  "LUCKY_DRAW", "MYSTERY_GIFT", "ANNUAL_DINNER", "PROMOTION_BADGE", "RECOGNITION",
];

const EMPTY: RewardItem = {
  id: "", name: "", description: "", category: "COMPANY_GIFT",
  pointsCost: 100, stock: -1, imageEmoji: "🎁", isActive: true,
};

function RewardForm({ initial, onDone, onCancel }: { initial: RewardItem; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<RewardItem>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = !!initial.id;

  const save = () => {
    setMsg(null);
    start(async () => {
      const payload = {
        name: form.name,
        description: form.description ?? "",
        category: form.category,
        pointsCost: Number(form.pointsCost),
        stock: Number(form.stock),
        imageEmoji: form.imageEmoji,
        isActive: form.isActive,
      };
      const res = editing ? await updateReward(initial.id, payload) : await createReward(payload);
      if (res.ok) { onDone(); } else { setMsg(res.error); }
    });
  };

  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-[64px_1fr]">
        <label className="text-xs font-semibold text-ink-muted">Icon
          <input className="input mt-1 text-center text-2xl" value={form.imageEmoji} maxLength={4}
            onChange={(e) => setForm({ ...form, imageEmoji: e.target.value })} />
        </label>
        <label className="text-xs font-semibold text-ink-muted">Name
          <input className="input mt-1" value={form.name} placeholder="e.g. RM50 Grab voucher"
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
      </div>
      <label className="text-xs font-semibold text-ink-muted">Description
        <input className="input mt-1" value={form.description ?? ""} placeholder="Short details staff will see"
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs font-semibold text-ink-muted">Category
          <select className="input mt-1" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-muted">Cost (💎)
          <input type="number" min={0} className="input mt-1" value={form.pointsCost}
            onChange={(e) => setForm({ ...form, pointsCost: Number(e.target.value) })} />
        </label>
        <label className="text-xs font-semibold text-ink-muted">Stock (-1 = ∞)
          <input type="number" min={-1} className="input mt-1" value={form.stock}
            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
        Active (visible in the store)
      </label>
      {msg && <div className="text-xs text-amber-600">{msg}</div>}
      <div className="flex gap-2">
        <button className="btn-primary px-4 py-1.5 text-sm" disabled={pending} onClick={save}>{pending ? "Saving…" : editing ? "Save changes" : "Add reward"}</button>
        <button className="btn-ghost px-4 py-1.5 text-sm" disabled={pending} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/** "Add reward" button + collapsible create form, shown above the store grid. */
export function AddRewardPanel() {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn-primary" onClick={() => setOpen(true)}>＋ Add reward</button>;
  return <RewardForm initial={{ ...EMPTY }} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />;
}

/** Edit / Delete controls placed on each reward card for managers. */
export function RewardCardControls({ reward }: { reward: RewardItem }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (editing) return <RewardForm initial={reward} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />;

  const remove = () => {
    if (!confirm(`Delete "${reward.name}" from the reward store?`)) return;
    setMsg(null);
    start(async () => {
      const res = await deleteReward(reward.id);
      if (!res.ok) setMsg(res.error); // e.g. deactivated instead because it has history
    });
  };

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <div className="flex gap-2">
        <button className="btn-ghost flex-1 px-2 py-1 text-xs" disabled={pending} onClick={() => setEditing(true)}>✏️ Edit</button>
        <button className="btn-danger flex-1 px-2 py-1 text-xs" disabled={pending} onClick={remove}>🗑️ Delete</button>
      </div>
      {msg && <div className="mt-1 text-xs text-amber-600">{msg}</div>}
    </div>
  );
}
