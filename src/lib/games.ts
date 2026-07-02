// Check-in games config — client-safe (no server imports).

/** Daily spin wheel segments (visual order) and the weighted prize table. */
export const SPIN_WHEEL_VALUES = [2, 5, 2, 10, 2, 5, 20, 5]; // 8 segments, alternating for looks

/** Weighted prize odds used server-side: value → weight. */
export const SPIN_PRIZES: { value: number; weight: number }[] = [
  { value: 2, weight: 50 },
  { value: 5, weight: 30 },
  { value: 10, weight: 15 },
  { value: 20, weight: 5 },
];

/** Streak milestones (consecutive clock-in days) → diamond bonus. */
export const STREAK_MILESTONES: Record<number, number> = {
  3: 10,
  7: 25,
  14: 50,
  30: 100,
};
