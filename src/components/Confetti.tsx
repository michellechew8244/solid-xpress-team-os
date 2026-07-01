"use client";

const DEFAULT_COLORS = ["#2f60f0", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2"];

/** Lightweight CSS confetti burst, reused by any celebration moment (level-up, lucky draw win, ...). */
export function Confetti({ count = 28, colors = DEFAULT_COLORS }: { count?: number; colors?: string[] }) {
  const pieces = Array.from({ length: count }, (_, i) => ({
    left: Math.round(Math.random() * 100),
    delay: Math.round(Math.random() * 400),
    color: colors[i % colors.length],
  }));
  return (
    <>
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={{ left: `${p.left}%`, animationDelay: `${p.delay}ms`, background: p.color }} />
      ))}
    </>
  );
}
