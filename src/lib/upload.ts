import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

// Note: no `server-only` guard here — this module is only ever imported from
// "use server" action files (which are inherently server-only), and keeping
// it import-safe lets it be exercised directly by node/tsx scripts and tests.

/**
 * Local disk file storage for uploaded training material (video/PPT/PDF) and
 * completion proof. Files are saved under public/uploads/<subdir>/ and served
 * by Next.js as static assets at /uploads/<subdir>/<file>.
 *
 * This is intentionally simple (no S3/blob store) since the app runs as a
 * single Next.js server. To move to cloud storage later, swap the body of
 * saveUploadedFile() for an upload call and keep the same return shape.
 */

const MAX_BYTES: Record<string, number> = {
  video: 150 * 1024 * 1024, // 150MB
  slides: 25 * 1024 * 1024, // 25MB (PPT/PDF)
  proof: 10 * 1024 * 1024, // 10MB (completion certificate/screenshot)
};

const ALLOWED_MIME: Record<string, string[]> = {
  video: ["video/mp4", "video/webm", "video/ogg", "video/quicktime"],
  slides: [
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  proof: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
};

function sanitize(filename: string): string {
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
 * `category` selects the size/type policy: "video" | "slides" | "proof".
 */
export async function saveUploadedFile(file: File, subdir: string, category: "video" | "slides" | "proof"): Promise<SavedFile> {
  if (file.size === 0) throw new Error("The selected file is empty.");
  const maxBytes = MAX_BYTES[category];
  if (file.size > maxBytes) {
    throw new Error(`File is too large (max ${Math.round(maxBytes / (1024 * 1024))}MB for ${category}).`);
  }
  const allowed = ALLOWED_MIME[category];
  if (file.type && !allowed.includes(file.type)) {
    throw new Error(`Unsupported file type "${file.type}" for ${category}.`);
  }

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
