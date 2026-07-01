"use client";

import { useEffect, useRef, useState } from "react";

export interface WheelSegment {
  key: string;
  label: string;
  color: string;
}

/**
 * Generic spinning-wheel visual. The wheel never decides the outcome itself —
 * the caller already knows `targetKey` (picked fairly server-side beforehand)
 * and this component just animates a believable, satisfying spin that lands
 * exactly on it. Bump `spinTrigger` to fire a new spin.
 */
export function SpinWheel({
  segments,
  targetKey,
  spinTrigger,
  onSpinEnd,
  size = 260,
}: {
  segments: WheelSegment[];
  targetKey: string | null;
  spinTrigger: number;
  onSpinEnd?: () => void;
  size?: number;
}) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const lastTrigger = useRef(0);
  const onSpinEndRef = useRef(onSpinEnd);
  onSpinEndRef.current = onSpinEnd;

  useEffect(() => {
    if (spinTrigger === 0 || spinTrigger === lastTrigger.current) return;
    lastTrigger.current = spinTrigger;
    if (!targetKey || segments.length === 0) return;

    const n = segments.length;
    const anglePerSeg = 360 / n;
    const targetIndex = Math.max(0, segments.findIndex((s) => s.key === targetKey));
    const targetCenterAngle = targetIndex * anglePerSeg + anglePerSeg / 2;
    // Rotating the wheel clockwise by R moves the point at `targetCenterAngle`
    // to (targetCenterAngle + R) mod 360; we want that to land at 0 (the
    // pointer, fixed at 12 o'clock).
    const finalMod = ((360 - targetCenterAngle) % 360 + 360) % 360;
    const currentMod = ((rotation % 360) + 360) % 360;
    const forwardDelta = ((finalMod - currentMod) + 360) % 360;
    const fullSpins = 5;
    const newRotation = rotation + fullSpins * 360 + forwardDelta;

    setSpinning(true);
    setRotation(newRotation);
    const timer = setTimeout(() => {
      setSpinning(false);
      onSpinEndRef.current?.();
    }, 3200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinTrigger, targetKey]);

  const n = segments.length || 1;
  const anglePerSeg = 360 / n;
  const gradientStops = segments.map((s, i) => `${s.color} ${i * anglePerSeg}deg ${(i + 1) * anglePerSeg}deg`).join(", ") || "#e2e8f0 0deg 360deg";

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="absolute left-1/2 -top-3 z-10 -translate-x-1/2 text-2xl leading-none">🔻</div>
      <div
        className="h-full w-full rounded-full border-[6px] border-white shadow-xl"
        style={{
          background: `conic-gradient(${gradientStops})`,
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 3.2s cubic-bezier(0.12, 0.72, 0.2, 1)" : "none",
        }}
      >
        {segments.map((s, i) => {
          const mid = i * anglePerSeg + anglePerSeg / 2;
          return (
            <div key={s.key} className="absolute inset-0" style={{ transform: `rotate(${mid}deg)` }}>
              <div className="absolute left-1/2 top-2 -translate-x-1/2">
                <div className="w-16 text-center text-[10px] font-bold leading-tight text-white drop-shadow" style={{ transform: `rotate(${-mid}deg)` }}>
                  {s.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink shadow" />
    </div>
  );
}
