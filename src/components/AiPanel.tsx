"use client";

import { useState } from "react";

/**
 * Optional AI assistant panel (section J). Posts the supplied context to the
 * /api/ai endpoint which either calls Claude (if a key is configured) or
 * returns a templated fallback. AI never approves — it only assists.
 */
export function AiPanel({
  scope,
  title,
  context,
}: {
  scope: string;
  title: string;
  context: Record<string, unknown>;
}) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setText(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, context }),
      });
      const data = await res.json();
      setText(data.text);
      setSource(data.source);
    } catch {
      setText("Could not generate a summary right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card border-l-4 border-l-brand-400 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">✨ {title}</h2>
        <button className="btn-primary px-3 py-1.5 text-xs" onClick={run} disabled={loading}>
          {loading ? "Thinking…" : "Generate"}
        </button>
      </div>
      {text && (
        <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-ink-soft">
          {text}
          {source === "fallback" && (
            <div className="mt-2 text-[11px] text-ink-muted">
              ⚙️ Generated offline (no ANTHROPIC_API_KEY set). Add a key in .env for live Claude summaries.
            </div>
          )}
        </div>
      )}
      {!text && !loading && (
        <p className="mt-2 text-xs text-ink-muted">
          AI assists only — it never makes approval decisions. Final approval stays with a human manager.
        </p>
      )}
    </div>
  );
}
