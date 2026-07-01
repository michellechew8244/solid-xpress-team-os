"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { visibleNav } from "./nav";

export function Sidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const groups = visibleNav(role);
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed left-3 top-3 z-40 rounded-lg bg-brand-700 p-2 text-white md:hidden"
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed z-30 flex h-screen w-64 flex-col bg-brand-950 text-brand-100 transition-transform md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 px-5 py-5 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10">📦</span>
          <div>
            <div className="text-sm font-bold leading-tight">Solid Xpress</div>
            <div className="text-[11px] text-brand-300">Team OS</div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-brand-400">
                {g.group}
              </div>
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        active ? "bg-brand-600 text-white" : "text-brand-100 hover:bg-white/5"
                      }`}
                    >
                      <span className="text-base">{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
