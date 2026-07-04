"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between bg-brand-700 p-8 text-white md:flex">
          <div>
            <div className="flex items-center gap-2 text-xl font-bold">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15">📦</span>
              Solid Xpress
            </div>
            <div className="mt-1 text-sm text-brand-100">Team OS</div>
          </div>
          <div>
            <h2 className="text-2xl font-bold leading-tight">
              Turn company goals into daily action, KPI, points & rewards.
            </h2>
            <p className="mt-3 text-sm text-brand-100">
              See everything clearly. Every department has clear numbers. Every staff
              knows what to do today.
            </p>
          </div>
          <div className="text-xs text-brand-200">Total Logistics · Malaysia</div>
        </div>

        {/* Form */}
        <div className="p-8">
          <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-muted">Sign in to your Team OS account.</p>

          <form action={action} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" className="input" placeholder="you@solidxpress.com.my" autoComplete="username" required />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" className="input" placeholder="••••••••" autoComplete="current-password" required />
            </div>

            {state.error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-3 text-center text-sm text-ink-muted">
            New staff? <a href="/signup" className="font-semibold text-brand-600 hover:underline">Sign up here</a> — management approves your account.
          </p>
        </div>
      </div>
    </div>
  );
}
