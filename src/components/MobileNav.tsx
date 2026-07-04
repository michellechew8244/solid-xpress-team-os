"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup } from "./nav";

/**
 * Mobile navigation (< md): a fixed bottom tab bar with the most-used
 * destinations plus a "Menu" button that opens a full slide-up drawer with
 * every allowed nav item. Only renders items the user actually has access to
 * (the `groups` are already filtered per-user in the layout).
 */

// Preferred quick-links, in priority order; the first 4 the user can access win.
const QUICK_ORDER = ["/dashboard", "/attendance", "/wallet", "/forum", "/missions-hub", "/leaderboard", "/proposals", "/work-reports"];

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => { setOpen(false); }, [pathname]);
  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (open) { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }
  }, [open]);

  const allItems = groups.flatMap((g) => g.items);
  const byHref = new Map(allItems.map((i) => [i.href, i]));
  const quick = QUICK_ORDER.map((h) => byHref.get(h)).filter(Boolean).slice(0, 4) as typeof allItems;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {quick.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${isActive(item.href) ? "text-brand-700" : "text-ink-muted"}`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="max-w-full truncate px-1">{item.label.split(" ")[0]}</span>
          </Link>
        ))}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-ink-muted"
          aria-label="Open menu"
        >
          <span className="text-xl leading-none">☰</span>
          <span>Menu</span>
        </button>
      </nav>

      {/* Full menu drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-brand-950 pb-[env(safe-area-inset-bottom)] text-brand-100">
            <div className="sticky top-0 flex items-center justify-between bg-brand-950 px-5 py-4">
              <div className="flex items-center gap-2 text-white">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">📦</span>
                <div className="text-sm font-bold">Solid Xpress Team OS</div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1 text-sm text-brand-200 hover:bg-white/10" aria-label="Close menu">✕</button>
            </div>
            <div className="space-y-4 px-3 pb-6">
              {groups.map((g) => (
                <div key={g.group}>
                  <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-brand-400">{g.group}</div>
                  <div className="grid grid-cols-2 gap-1">
                    {g.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive(item.href) ? "bg-brand-600 text-white" : "text-brand-100 hover:bg-white/5"}`}
                      >
                        <span className="text-base">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
