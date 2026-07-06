"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postForumMessage, deleteForumMessage } from "@/app/(app)/forum/actions";

export function ForumComposer({ people = [] }: { people?: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [mentionQ, setMentionQ] = useState<string | null>(null); // text after the active "@"
  const [hi, setHi] = useState(0); // highlighted suggestion index
  const ref = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Light "live" feel: refresh the stream every 15s so new messages appear.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [router]);

  // Detect an in-progress @mention at the caret: "@par" (≤30 chars, no newline).
  function refreshMention(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = before.match(/(?:^|\s)@([^@\n]{0,30})$/);
    setMentionQ(m ? m[1] : null);
    setHi(0);
  }

  const suggestions = mentionQ === null
    ? []
    : people.filter((p) => p.name.toLowerCase().startsWith(mentionQ.toLowerCase())).slice(0, 6);

  function pickMention(name: string) {
    const ta = taRef.current;
    if (!ta || mentionQ === null) return;
    const caret = ta.selectionStart;
    const before = body.slice(0, caret).replace(/@[^@\n]{0,30}$/, `@${name} `);
    const after = body.slice(caret);
    setBody(before + after);
    setMentionQ(null);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(before.length, before.length); });
  }

  return (
    <form
      ref={ref}
      action={(fd) => start(async () => {
        setErr(null);
        try { await postForumMessage(fd); setBody(""); setMentionQ(null); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
      })}
      className="flex items-end gap-2"
    >
      <div className="relative flex-1">
        {/* @mention suggestion dropdown */}
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {suggestions.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-sm ${i === hi ? "bg-brand-50 text-brand-700" : "hover:bg-slate-50"}`}
                onMouseDown={(e) => { e.preventDefault(); pickMention(p.name); }}
              >
                @{p.name}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          name="body"
          className="input min-h-11 resize-none"
          placeholder="Share something… type @ to mention someone"
          maxLength={2000}
          value={body}
          onChange={(e) => { setBody(e.target.value); refreshMention(e.target.value, e.target.selectionStart); }}
          onClick={(e) => refreshMention(body, e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % suggestions.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + suggestions.length) % suggestions.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickMention(suggestions[hi].name); return; }
              if (e.key === "Escape") { setMentionQ(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ref.current?.requestSubmit(); }
          }}
          required
        />
        {err && <div className="mt-1 text-xs text-danger">{err}</div>}
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "…" : "Send"}</button>
    </form>
  );
}

export function DeleteMessageButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-[10px] text-ink-muted hover:text-danger hover:underline" disabled={pending} onClick={() => start(() => deleteForumMessage(id))}>
      delete
    </button>
  );
}
