/**
 * AI assistant service (section J).
 *
 * Design goals:
 *  - AI is OPTIONAL and never makes approval decisions (human-in-the-loop).
 *  - Works offline: if no ANTHROPIC_API_KEY is configured, we return a
 *    deterministic templated summary built from the supplied context so the
 *    feature still demonstrates end-to-end.
 *  - When a key is present, we call the Claude Messages API.
 */

const API_URL = "https://api.anthropic.com/v1/messages";

export interface AiResult {
  text: string;
  source: "claude" | "fallback";
}

export async function runAssistant(
  systemPrompt: string,
  userPrompt: string,
  fallback: () => string,
): Promise<AiResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { text: fallback(), source: "fallback" };
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      return { text: fallback(), source: "fallback" };
    }
    const data = await res.json();
    const text: string =
      data?.content?.map((c: { text?: string }) => c.text ?? "").join("\n") ??
      fallback();
    return { text: text.trim() || fallback(), source: "claude" };
  } catch {
    return { text: fallback(), source: "fallback" };
  }
}
