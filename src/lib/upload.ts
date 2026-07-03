import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { MAX_BYTES, ALLOWED_MIME, validateUpload, type UploadCategory } from "./upload-limits";

// Note: no `server-only` guard here — this module is only ever imported from
// "use server" action files (which are inherently server-only), and keeping
// it import-safe lets it be exercised directly by node/tsx scripts and tests.

/**
 * Local disk file storage for uploaded training material (video/PPT/PDF) and
 * completion proof. Files are saved under public/uploads/<subdir>/ and served
 * by Next.js as static assets at /uploads/<subdir>/<file>.
 *
 * Size/type policy lives in ./upload-limits (client-safe, shared with the
 * browser so both sides enforce identical rules).
 */

export { MAX_BYTES, ALLOWED_MIME, validateUpload };

export function sanitize(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export interface SavedFile {
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Validate and persist an uploaded File to public/uploads/<subdir>/.
 * `category` selects the size/type policy: "video" | "slides" | "proof" | "document".
 */
export async function saveUploadedFile(file: File, subdir: string, category: UploadCategory): Promise<SavedFile> {
  validateUpload(category, file.size, file.type);

  const dir = path.join(process.cwd(), "public", "uploads", subdir);
  await mkdir(dir, { recursive: true });

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${unique}-${sanitize(file.name || "file")}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return {
    filename: file.name || filename,
    url: `/uploads/${subdir}/${filename}`,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
}

/** Best-effort delete of a previously saved file (ignores missing files). */
export async function deleteUploadedFile(url: string) {
  if (!url.startsWith("/uploads/")) return; // never delete outside our own uploads dir
  try {
    await unlink(path.join(process.cwd(), "public", url));
  } catch {
    // already gone — fine.
  }
}
