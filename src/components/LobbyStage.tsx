"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface CrewMember { id: string; name: string; color: string; photo: string | null; late: boolean; time: string }

/** Stable pseudo-random 0..1 from a string (keeps avatar positions steady across refreshes). */
function seed(str: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

export function LobbyStage({ crew, total, date, checkinUrl }: { crew: CrewMember[]; total: number; date: string; checkinUrl: string }) {
  const router = useRouter();
  const [audioOn, setAudioOn] = useState(false);
  const [burst, setBurst] = useState(0);
  const prev = useRef(crew.length);
  const audioRef = useRef<{ ctx: AudioContext; master: GainNode; timer: number } | null>(null);

  const complete = total > 0 && crew.length >= total;

  // Auto-refresh so new check-ins appear on the big screen.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [router]);

  // React to new arrivals: confetti burst + welcome chime.
  useEffect(() => {
    if (crew.length > prev.current) {
      setBurst((b) => b + 1);
      chime(audioRef.current?.ctx ?? null, audioRef.current?.master ?? null);
    }
    prev.current = crew.length;
  }, [crew.length]);

  // ---- Generated ambient music (no audio file needed) ----
  function startAudio() {
    if (audioRef.current) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.16;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 900;
    lp.connect(master); master.connect(ctx.destination);
    // Soft evolving pad (A2 / E3 / A3).
    [110, 164.81, 220].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.25;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
      const lg = ctx.createGain(); lg.gain.value = 0.12;
      lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(lp); o.start(); lfo.start();
    });
    // Gentle arpeggio every few seconds.
    const scale = [440, 554.37, 659.25, 880];
    const timer = window.setInterval(() => {
      const n = scale[Math.floor(Math.random() * scale.length)];
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = n;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
      o.connect(g); g.connect(lp); o.start(); o.stop(ctx.currentTime + 1.7);
    }, 3500);
    audioRef.current = { ctx, master, timer };
    setAudioOn(true);
  }
  function stopAudio() {
    const a = audioRef.current; if (!a) return;
    clearInterval(a.timer); a.ctx.close(); audioRef.current = null; setAudioOn(false);
  }
  useEffect(() => () => { const a = audioRef.current; if (a) { clearInterval(a.timer); a.ctx.close(); } }, []);

  function fullscreen() {
    const el = document.getElementById("lobby-root");
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  const pct = total > 0 ? Math.round((crew.length / total) * 100) : 0;

  return (
    <div id="lobby-root" className="relative min-h-screen overflow-hidden bg-[#0a0a1f] text-white">
      {/* Neon backdrop */}
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(1200px 500px at 50% -10%, rgba(99,102,241,0.35), transparent), radial-gradient(800px 400px at 10% 110%, rgba(217,70,239,0.25), transparent), radial-gradient(800px 400px at 90% 110%, rgba(6,182,212,0.25), transparent)" }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(129,140,248,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(129,140,248,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px", transform: "perspective(500px) rotateX(60deg)", transformOrigin: "bottom" }} />

      {/* Header */}
      <div className="relative flex items-start justify-between p-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_0_20px_rgba(129,140,248,0.8)] sm:text-4xl">📦 Welcome to Solid Xpress</h1>
          <div className="mt-1 text-xs uppercase tracking-[0.3em] text-indigo-300">Team OS · Daily Crew Check-in · {date}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fullscreen} className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" aria-label="Fullscreen">⛶</button>
          <button onClick={audioOn ? stopAudio : startAudio} className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm hover:bg-white/10" aria-label="Toggle music">{audioOn ? "🔊" : "🔈"}</button>
          <div className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-right">
            <div className="text-2xl font-black leading-none text-cyan-300">CREW: {crew.length}<span className="text-base text-cyan-500"> / {total}</span></div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-400">on board</div>
          </div>
        </div>
      </div>

      {/* Crew cluster */}
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-center gap-x-4 gap-y-6 px-6 pb-40 pt-6">
        {crew.length === 0 && (
          <div className="py-20 text-center text-indigo-300">
            <div className="text-5xl">🛸</div>
            <div className="mt-2 text-lg">No crew aboard yet — scan the code to check in!</div>
          </div>
        )}
        {crew.map((m) => {
          const bob = 2 + seed(m.id, 7) * 3; // 2–5s
          const delay = seed(m.id, 13) * 2;
          return (
            <div key={m.id} className="flex flex-col items-center" style={{ animation: `lobby-bob ${bob}s ease-in-out ${delay}s infinite` }}>
              <div className="relative grid h-14 w-14 place-items-center rounded-full text-lg font-bold shadow-[0_0_18px_rgba(129,140,248,0.6)] ring-2 ring-white/30" style={{ background: m.color }}>
                {m.photo ? <img src={m.photo} alt={m.name} className="h-full w-full rounded-full object-cover" /> : m.name.slice(0, 2).toUpperCase()}
                {m.late && <span className="absolute -right-1 -top-1 text-xs" title="Late">⏰</span>}
              </div>
              <div className="mt-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">{m.name.split(" ")[0]}</div>
            </div>
          );
        })}
      </div>

      {/* Confetti bursts on new arrivals */}
      {burst > 0 && (
        <div key={burst} className="pointer-events-none absolute inset-0 flex justify-center">
          {Array.from({ length: 30 }).map((_, i) => (
            <span key={i} className="confetti-piece" style={{ left: `${(i * 3.3) % 100}%`, animationDelay: `${(i % 6) * 80}ms`, background: ["#818cf8", "#22d3ee", "#e879f9", "#facc15", "#34d399"][i % 5] }} />
          ))}
        </div>
      )}

      {/* QR check-in card */}
      <div className="absolute bottom-6 left-6 w-48 rounded-2xl border border-emerald-400/40 bg-black/50 p-3 text-center backdrop-blur">
        <div className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-300">📷 Scan to check in</div>
        <img alt="Check-in QR" width={168} height={168} className="mx-auto rounded-lg bg-white p-1" src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(checkinUrl)}`} />
        <div className="mt-1 text-[10px] uppercase tracking-wider text-emerald-400">Point your phone camera</div>
      </div>

      {/* Status / launch banner */}
      <div className="absolute inset-x-0 bottom-6 text-center">
        {complete ? (
          <div className="animate-pulse text-2xl font-black tracking-[0.3em] text-emerald-300 drop-shadow-[0_0_20px_rgba(52,211,153,0.9)]">🚀 ALL CREW ABOARD — READY FOR LAUNCH!</div>
        ) : (
          <div className="text-lg tracking-[0.35em] text-indigo-300/80">WAITING FOR FULL CREW… {pct}%</div>
        )}
      </div>

      {!audioOn && (
        <button onClick={startAudio} className="absolute bottom-6 right-6 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">🎵 Start music</button>
      )}

      <style>{`@keyframes lobby-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }`}</style>
    </div>
  );
}

/** A short bright welcome chime when someone new checks in. */
function chime(ctx: AudioContext | null, master: GainNode | null) {
  if (!ctx || !master) return;
  [659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
    const g = ctx.createGain(); const t = ctx.currentTime + i * 0.09;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.7);
  });
}
