"use client";

import { requestUploadTicket } from "@/app/(app)/training/actions";

/**
 * Client-side upload staging. For each named file input in the FormData, ask
 * the server for a signed upload URL, PUT the file straight to Supabase
 * Storage (so big videos never hit a serverless function), then replace the
 * File in the FormData with `<field>Url/Name/Type/Size` metadata fields.
 *
 * If cloud storage isn't configured (local dev), the ticket is null and the
 * raw File stays in the form — the server action saves it to local disk.
 */
/**
 * Upload a single proof photo straight to cloud storage and return its public
 * URL. Returns null when cloud storage isn't configured (local dev) — callers
 * treat the photo as optional in that case.
 */
export async function uploadProofPhoto(file: File): Promise<string | null> {
  const ticket = await requestUploadTicket("proof", file.name, file.size, file.type);
  if (!ticket) return null;
  const res = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status}). Please try again.`);
  return ticket.publicUrl;
}

export async function stageUploads(
  fd: FormData,
  fields: { field: string; category: "video" | "slides" | "proof" | "document" }[],
): Promise<void> {
  for (const { field, category } of fields) {
    const file = fd.get(field);
    if (!(file instanceof File) || file.size === 0) continue;

    const ticket = await requestUploadTicket(category, file.name, file.size, file.type);
    if (!ticket) continue; // local-dev fallback: leave the File in the form

    const res = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status}). Please try again.`);

    fd.delete(field);
    fd.set(`${field}Url`, ticket.publicUrl);
    fd.set(`${field}Name`, file.name);
    fd.set(`${field}Type`, file.type || "application/octet-stream");
    fd.set(`${field}Size`, String(file.size));
  }
}
