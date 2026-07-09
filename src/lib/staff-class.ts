/**
 * Staff Class A / B / C — a simple monthly classification derived from the
 * result-oriented individual performance score. Pure data, safe to import
 * from client components (no prisma).
 *
 * Class A ≥ 85  — top performer: priority for bonus multiplier, promotion
 *                 consideration and PK champion picks.
 * Class B 70–84 — solid performer: on track, aim for Class A.
 * Class C < 70  — needs support: coaching triggered, multiplier drops to 0,
 *                 excluded from bonus until back above 70.
 */

export type StaffClass = "A" | "B" | "C";

export interface StaffClassDef {
  cls: StaffClass;
  minScore: number;
  label: string;
  emoji: string;
  /** Tailwind classes for the badge pill. */
  badge: string;
  meaning: string;
}

export const STAFF_CLASS_BANDS: StaffClassDef[] = [
  {
    cls: "A", minScore: 85, label: "Class A", emoji: "🥇",
    badge: "bg-emerald-100 text-emerald-700",
    meaning: "Top performer — priority for bonus, promotion consideration and recognition.",
  },
  {
    cls: "B", minScore: 70, label: "Class B", emoji: "🥈",
    badge: "bg-sky-100 text-sky-700",
    meaning: "Solid performer — on track; lift your weakest result area to reach Class A.",
  },
  {
    cls: "C", minScore: 0, label: "Class C", emoji: "🎓",
    badge: "bg-amber-100 text-amber-700",
    meaning: "Needs support — coaching plan applies; bonus multiplier is 0 until score returns above 70.",
  },
];

export function classForScore(score: number): StaffClassDef {
  return STAFF_CLASS_BANDS.find((b) => score >= b.minScore) ?? STAFF_CLASS_BANDS[STAFF_CLASS_BANDS.length - 1];
}
