"use client";

import { requestUploadTicket } from "@/app/(app)/training/actions";
import { validateUpload } from "@/lib/upload-limits";

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
  validateUpload("proof", file.size, file.type); // fails fast, client-side, with a clear message
  const ticket = await requestUploadTicket("proof", file.name, file.size, file.type);
  if (!ticket) return null;
  const res = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status}). ${res.status === 413 ? "The file exceeds the storage size limit." : "Please try again."}`);
  return ticket.publicUrl;
}

export type StagedFile = { url: string; name: string; type: string; size: number };

/**
 * Upload a batch of files (e.g. a whole dropped folder of slides/docs) straight
 * to cloud storage and return their metadata. Used by the multi-file training
 * material picker. Reports progress via the optional callback.
 */
export async function stageFiles(
  files: File[],
  category: "material",
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<StagedFile[]> {
  const out: StagedFile[] = [];
  const usable = files.filter((f) => f instanceof File && f.size > 0);
  for (let i = 0; i < usable.length; i++) {
    const file = usable[i];
    onProgress?.(i, usable.length, file.name);
    validateUpload(category, file.size, file.type);
    const ticket = await requestUploadTicket(category, file.name, file.size, file.type);
    if (!ticket) throw new Error("Cloud storage isn't configured, so folder upload isn't available here.");
    const res = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload of "${file.name}" failed (${res.status}). ${res.status === 413 ? "It exceeds the storage size limit — ask an admin to raise the Storage upload limit." : "Please try again."}`);
    out.push({ url: ticket.publicUrl, name: file.name, type: file.type || "application/octet-stream", size: file.size });
  }
  onProgress?.(usable.length, usable.length, "");
  return out;
}

export async function stageUploads(
  fd: FormData,
  fields: { field: string; category: "video" | "slides" | "proof" | "document" | "material" }[],
): Promise<void> {
  for (const { field, category } of fields) {
    const file = fd.get(field);
    if (!(file instanceof File) || file.size === 0) continue;

    validateUpload(category, file.size, file.type); // fails fast, client-side, clear message

    const ticket = await requestUploadTicket(category, file.name, file.size, file.type);
    if (!ticket) continue; // local-dev fallback: leave the File in the form

    const res = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(`Upload of "${file.name}" failed (${res.status}). ${res.status === 413 ? "It exceeds the storage size limit — ask an admin to raise the Storage upload limit." : "Please try again."}`);

    fd.delete(field);
    fd.set(`${field}Url`, ticket.publicUrl);
    fd.set(`${field}Name`, file.name);
    fd.set(`${field}Type`, file.type || "application/octet-stream");
    fd.set(`${field}Size`, String(file.size));
  }
}
