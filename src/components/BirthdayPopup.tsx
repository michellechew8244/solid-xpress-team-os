"use client";

import { useEffect, useState } from "react";
import { Confetti } from "@/components/Confetti";

export interface BirthdayInfo {
  todayKey: string; // "MM-DD" today (KL) — used to show the popup once per day
  names: string[]; // everyone with a birthday today
  isMine: boolean; // is it the current viewer's birthday
}

/** Celebratory popup shown once per calendar day when someone has a birthday. */
export function BirthdayPopup({ info }: { info: BirthdayInfo }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (info.names.length === 0) return;
    const seenKey = `sx-bday-seen-${info.todayKey}`;
    if (localStorage.getItem(seenKey)) return;
    setOpen(true);
    localStorage.setItem(seenKey, "1");
  }, [info]);

  if (!open || info.names.length === 0) return null;

  const list = info.names.length === 1 ? info.names[0] : `${info.names.slice(0, -1).join(", ")} and ${info.names[info.names.length - 1]}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <Confetti count={40} />
        <div className="relative text-6xl">🎂</div>
        <h2 className="relative mt-3 text-2xl font-black text-brand-700">
          {info.isMine ? "Happy Birthday to You! 🎉" : "🎉 Happy Birthday!"}
        </h2>
        <p className="relative mt-2 text-sm text-ink">
          {info.isMine
            ? `The whole Solid Xpress team wishes you an amazing day, ${info.names.length > 1 ? "and " : ""}`
            : "Today we celebrate "}
          <span className="font-bold">{info.isMine && info.names.length === 1 ? "" : list}</span>
          {info.isMine ? " 🥳" : "! Send them your wishes on the Staff Forum 💬"}
        </p>
        <button className="btn-primary relative mt-5 w-full" onClick={() => setOpen(false)}>🎈 Celebrate!</button>
      </div>
    </div>
  );
}
