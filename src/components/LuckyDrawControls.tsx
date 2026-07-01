"use client";

import { useRef, useState, useTransition } from "react";
import { CAMPAIGN_TEMPLATES } from "@/lib/enums";
import { buyEntry, drawPrize, markPrizeClaimed, createCampaign, createFromTemplate, addPrize, grantEntries, type DrawResult } from "@/app/(app)/lucky-draw/actions";
import { SpinWheel, type WheelSegment } from "@/components/SpinWheel";
import { Confetti } from "@/components/Confetti";
import { Avatar } from "@/components/ui";

const WHEEL_COLORS = ["#2f60f0", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#4d7c0f"];

export function TemplatePicker() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="inline-block">
      <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>📋 From Template</button>
      {open && (
        <div className="card absolute z-10 mt-2 w-72 p-2">
          {CAMPAIGN_TEMPLATES.map((t) => (
            <button
              key={t.type}
              disabled={pending}
              onClick={() => start(async () => { await createFromTemplate(t.type); setOpen(false); })}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <div className="font-semibold text-ink">{t.title}</div>
              <div className="text-xs text-ink-muted">{t.prizes.length} prizes · {t.pointsPerEntry > 0 ? `${t.pointsPerEntry} pts/entry` : "earned entries"}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BuyEntryButton({ campaignId, cost, balance }: { campaignId: string; cost: number; balance: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (cost <= 0) return null;
  return (
    <div>
      <button className="btn-primary" disabled={pending || balance < cost} onClick={() => start(async () => { try { await buyEntry(campaignId); setMsg("Entry added 🎟️"); } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } })}>
        Buy entry · {cost} pts
      </button>
      {msg && <span className="ml-2 text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}

/**
 * Admin "Draw winner" control. The winner is chosen fairly server-side by
 * `drawPrize`; this component then plays an honest spin-the-wheel reveal that
 * lands on that exact winner. The wheel is purely theatrical — it never changes
 * who won.
 */
export function DrawButton({ prizeId }: { prizeId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [spinTrigger, setSpinTrigger] = useState(0);
  const [revealed, setRevealed] = useState(false);

  function launch() {
    setMsg(null);
    start(async () => {
      try {
        const r = await drawPrize(prizeId);
        setResult(r);
        setRevealed(false);
        // Kick off the spin on the next tick, once the wheel has mounted.
        setTimeout(() => setSpinTrigger((n) => n + 1), 50);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Error");
      }
    });
  }

  function close() {
    setResult(null);
    setRevealed(false);
  }

  const segments: WheelSegment[] = result
    ? result.candidates.map((c, i) => ({ key: c.userId, label: c.name, color: WHEEL_COLORS[i % WHEEL_COLORS.length] }))
    : [];

  // Winner's true odds = their entry weight / total entry weight in the pool.
  const totalWeight = result ? result.candidates.reduce((s, c) => s + c.weight, 0) : 0;
  const winnerWeight = result ? result.candidates.find((c) => c.userId === result.winnerId)?.weight ?? 0 : 0;
  const winnerChance = totalWeight > 0 ? Math.round((winnerWeight / totalWeight) * 100) : 0;

  return (
    <span>
      <button className="btn-primary px-3 py-1 text-xs" disabled={pending} onClick={launch}>
        {pending ? "Drawing…" : "🎲 Draw winner"}
      </button>
      {msg && <span className="ml-2 text-xs text-danger">{msg}</span>}

      {result && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={revealed ? close : undefined}>
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {revealed && <Confetti />}
            <div className="relative text-xs font-bold uppercase tracking-wide text-brand-600">Lucky Draw</div>
            <h2 className="relative mt-1 text-lg font-bold text-ink">🎁 {result.prizeName}</h2>
            <p className="relative text-xs text-ink-muted">{result.candidates.length} eligible {result.candidates.length === 1 ? "entrant" : "entrants"} in the draw</p>

            <div className="relative mt-4">
              <SpinWheel
                segments={segments}
                targetKey={result.winnerId}
                spinTrigger={spinTrigger}
                onSpinEnd={() => setRevealed(true)}
              />
            </div>

            {revealed ? (
              <div className="relative mt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Winner</div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <Avatar name={result.winnerName} color={result.winnerAvatarColor} size={32} />
                  <span className="text-xl font-bold text-ok">{result.winnerName} 🎉</span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">Won fairly with a {winnerChance}% chance</p>
                <button className="btn-primary mt-5 w-full" onClick={close}>Done</button>
              </div>
            ) : (
              <p className="relative mt-4 text-sm text-ink-muted">Spinning the wheel…</p>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

export function ClaimButton({ prizeId }: { prizeId: string }) {
  const [pending, start] = useTransition();
  return <button className="btn-ghost px-3 py-1 text-xs" disabled={pending} onClick={() => start(() => markPrizeClaimed(prizeId))}>Mark claimed</button>;
}

export function CreateCampaignForm() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>＋ New Campaign</button>
      {open && (
        <form ref={ref} action={async (fd) => { await createCampaign(fd); ref.current?.reset(); setOpen(false); }} className="card mt-3 grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label">Title</label><input name="title" className="input" required /></div>
          <div className="sm:col-span-2">
            <label className="label">Campaign type</label>
            <select name="campaignType" className="input">{CAMPAIGN_TEMPLATES.map((t) => <option key={t.type} value={t.type}>{t.title}</option>)}</select>
          </div>
          <div className="sm:col-span-2"><label className="label">Description</label><input name="description" className="input" /></div>
          <div><label className="label">Entry rule</label><input name="entryRule" className="input" placeholder="e.g. KPI score ≥85 = 1 entry" /></div>
          <div><label className="label">Points per entry (0 = none)</label><input name="pointsPerEntry" type="number" className="input" defaultValue={0} /></div>
          <div><label className="label">Draw date</label><input name="drawDate" type="date" className="input" /></div>
          <div><label className="label">First prize (optional)</label><input name="prizeName" className="input" placeholder="e.g. RM500 Cash" /></div>
          <div><label className="label">Prize value (RM)</label><input name="prizeValue" type="number" className="input" defaultValue={0} /></div>
          <div className="flex items-end gap-2"><button className="btn-primary">Create</button><button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}

export function AddPrizeForm({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <div className="mt-2">
      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen((o) => !o)}>＋ Add prize</button>
      {open && (
        <form ref={ref} action={async (fd) => { await addPrize(fd); ref.current?.reset(); setOpen(false); }} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="campaignId" value={campaignId} />
          <input name="prizeName" className="input w-44" placeholder="Prize name" required />
          <input name="prizeValue" type="number" className="input w-28" placeholder="Value RM" />
          <input name="quantity" type="number" className="input w-20" defaultValue={1} />
          <button className="btn-primary px-3 py-1 text-xs">Add</button>
        </form>
      )}
    </div>
  );
}

export function GrantEntryForm({ campaignId, staff }: { campaignId: string; staff: { id: string; name: string }[] }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={async (fd) => { await grantEntries(fd); ref.current?.reset(); }} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div><label className="label">Grant entries to</label>
        <select name="userId" className="input w-44" required><option value="">— staff —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </div>
      <div><label className="label">Count</label><input name="count" type="number" className="input w-20" defaultValue={1} /></div>
      <div><label className="label">Reason</label>
        <select name="sourceType" className="input w-40"><option value="KPI_SCORE">KPI score ≥85</option><option value="COMPLIMENT">Customer compliment</option><option value="ZERO_OVERDUE">Zero overdue</option><option value="ZERO_MISTAKE">Zero mistake</option><option value="TEAMWORK">Teamwork</option><option value="MANUAL">Manual</option></select>
      </div>
      <button className="btn-primary px-3 py-1 text-xs">Grant</button>
    </form>
  );
}
