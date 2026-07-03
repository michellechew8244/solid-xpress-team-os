"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postForumMessage, deleteForumMessage } from "@/app/(app)/forum/actions";

export function ForumComposer() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Light "live" feel: refresh the stream every 15s so new messages appear.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <form
      ref={ref}
      action={(fd) => start(async () => { setErr(null); try { await postForumMessage(fd); ref.current?.reset(); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); } })}
      className="flex items-end gap-2"
    >
      <div className="flex-1">
        <textarea
          name="body"
          className="input min-h-11 resize-none"
          placeholder="Share something with the whole team…"
          maxLength={2000}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ref.current?.requestSubmit(); } }}
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
