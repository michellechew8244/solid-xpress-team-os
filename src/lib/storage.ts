// Supabase Storage (server-side) — signed-upload tickets + deletes.
//
// Files are uploaded DIRECTLY from the browser to Supabase Storage using a
// short-lived signed upload URL issued here, so large videos never pass
// through a Vercel serverless function (which caps request bodies at ~4.5MB).
// The service_role key stays server-side only.

const BUCKET = "uploads";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export function isCloudStorageConfigured(): boolean {
  return config() !== null;
}

export interface UploadTicket {
  /** PUT the raw file body here (with the file's Content-Type header). */
  uploadUrl: string;
  /** Where the file will be publicly served from after the upload. */
  publicUrl: string;
  /** Object path inside the bucket. */
  path: string;
}

/** Issue a short-lived signed upload URL for a bucket path. */
export async function createUploadTicket(path: string): Promise<UploadTicket> {
  const cfg = config();
  if (!cfg) throw new Error("Cloud storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  const res = await fetch(`${cfg.url}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Could not create upload URL (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { url: string };
  return {
    uploadUrl: `${cfg.url}/storage/v1${data.url}`,
    publicUrl: `${cfg.url}/storage/v1/object/public/${BUCKET}/${path}`,
    path,
  };
}

/**
 * Server-side upload of a small buffer (e.g. a signup profile photo that
 * arrives via form post before the user has an account). Large files should
 * always use the signed-ticket browser path instead.
 */
export async function uploadBufferToStorage(path: string, buffer: Buffer, contentType: string): Promise<string> {
  const cfg = config();
  if (!cfg) throw new Error("Cloud storage is not configured.");
  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": contentType, "x-upsert": "false" },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status}).`);
  return `${cfg.url}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Best-effort delete of a stored object, given its public URL. */
export async function deleteStoredFile(publicUrl: string) {
  const cfg = config();
  if (!cfg) return;
  const prefix = `${cfg.url}/storage/v1/object/public/${BUCKET}/`;
  if (!publicUrl.startsWith(prefix)) return; // not ours
  const path = publicUrl.slice(prefix.length);
  try {
    await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cfg.key}` },
    });
  } catch {
    // best-effort — a dangling object is harmless.
  }
}
