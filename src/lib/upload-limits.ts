// Upload size/type policy — client-safe (no node imports), so both the browser
// and the server enforce the SAME rules. Keep this file free of node modules.

export const MAX_BYTES: Record<string, number> = {
  video: 500 * 1024 * 1024, // 500MB (corporate videos / .mov)
  slides: 100 * 1024 * 1024, // 100MB (PPT/PDF)
  proof: 10 * 1024 * 1024, // 10MB (completion certificate/screenshot)
  document: 50 * 1024 * 1024, // 50MB (Excel/Word/PDF/CSV job report)
};

export const ALLOWED_MIME: Record<string, string[]> = {
  video: ["video/mp4", "video/webm", "video/ogg", "video/quicktime"],
  slides: [
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  proof: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
  ],
};

export type UploadCategory = "video" | "slides" | "proof" | "document";

/** Validate a file's declared size/type against the category policy. */
export function validateUpload(category: UploadCategory, sizeBytes: number, mimeType: string) {
  if (sizeBytes <= 0) throw new Error("The selected file is empty.");
  const maxBytes = MAX_BYTES[category];
  if (sizeBytes > maxBytes) throw new Error(`File is too large (${(sizeBytes / (1024 * 1024)).toFixed(0)}MB) — the maximum for ${category} is ${Math.round(maxBytes / (1024 * 1024))}MB.`);
  // A blank mime (some browsers omit it for .mov/.csv) is allowed; only reject a
  // mime that is present AND not in the allow-list.
  if (mimeType && !ALLOWED_MIME[category].includes(mimeType)) throw new Error(`Unsupported file type "${mimeType}" for ${category}.`);
}
