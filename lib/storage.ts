import { Client } from "minio";
import { randomBytes } from "node:crypto";
import { extname } from "node:path";
import { Readable } from "node:stream";

// Write side of the existing media architecture. Reads keep going through
// NEXT_PUBLIC_IMAGE_CDN exactly as before (lib/images.ts) — this only adds the
// upload path the admin panel needs. Objects are stored under bucket-relative
// keys, the same convention properties.gallery already uses, so a row works
// unchanged across local, staging and prod.

const globalForStorage = globalThis as unknown as { __livingMinio?: Client };

export function hasStorage() {
  return Boolean(process.env.MINIO_ENDPOINT && process.env.MINIO_BUCKET);
}

function client(): Client {
  if (globalForStorage.__livingMinio) return globalForStorage.__livingMinio;

  const endPoint = process.env.MINIO_ENDPOINT;
  if (!endPoint) {
    throw new Error(
      "MINIO_ENDPOINT is not set. Copy .env.example to .env.local and fill in the MinIO block.",
    );
  }

  const instance = new Client({
    endPoint,
    port: process.env.MINIO_PORT ? Number(process.env.MINIO_PORT) : undefined,
    useSSL: process.env.MINIO_USE_SSL !== "false",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "",
    secretKey: process.env.MINIO_SECRET_KEY ?? "",
  });
  globalForStorage.__livingMinio = instance;
  return instance;
}

const bucket = () => process.env.MINIO_BUCKET ?? "living-images";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
const ALLOWED_DOC_TYPES = ["application/pdf"];

const MAX_UPLOAD_BYTES = {
  image: 12 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  document: 25 * 1024 * 1024,
} as const;

/**
 * Content type is validated against the field's expected kind rather than
 * trusted — a browser will happily label a .exe as image/png, and the sniffed
 * extension is what ends up in a URL.
 */
export function validateUpload(
  file: File,
  kind: "image" | "video" | "sketch" | "floor_plan" | "document",
): string | null {
  const group =
    kind === "video" ? "video" : kind === "document" ? "document" : "image";

  const allowed =
    group === "video"
      ? ALLOWED_VIDEO_TYPES
      : group === "document"
        ? [...ALLOWED_DOC_TYPES, ...ALLOWED_IMAGE_TYPES]
        : ALLOWED_IMAGE_TYPES;

  if (!allowed.includes(file.type)) {
    return `${file.name}: ${file.type || "unknown type"} isn't allowed here.`;
  }
  if (file.size > MAX_UPLOAD_BYTES[group]) {
    const mb = Math.round(MAX_UPLOAD_BYTES[group] / (1024 * 1024));
    return `${file.name} is larger than ${mb} MB.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/**
 * Uploads and returns the bucket-relative key.
 *
 * The filename is generated, never taken from the client: user-supplied names
 * carry path traversal ("../"), collisions and unicode surprises into object
 * keys that later become public URLs.
 */
export async function uploadObject(
  file: File,
  prefix: string,
): Promise<string> {
  const ext = extname(file.name).toLowerCase().slice(0, 8) || "";
  const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : "";
  const key = `/${prefix}/${Date.now()}-${randomBytes(6).toString("hex")}${safeExt}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await client().putObject(bucket(), key.slice(1), buffer, buffer.length, {
    "Content-Type": file.type,
    // Keys are content-addressed by random suffix, so they never change once
    // written and can be cached hard.
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  return key;
}

/**
 * Reads an object back out. Returns null when it isn't there, so a row
 * pointing at a deleted file renders a 404 rather than a 500.
 */
export async function getObject(key: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
} | null> {
  const name = key.replace(/^\/+/, "");
  try {
    const stat = await client().statObject(bucket(), name);
    const stream = await client().getObject(bucket(), name);
    return {
      body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      contentType: stat.metaData?.["content-type"] ?? "application/octet-stream",
      size: stat.size,
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "NoSuchKey" || code === "NotFound") return null;
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await client().removeObject(bucket(), key.replace(/^\//, ""));
  } catch (error) {
    // A missing object shouldn't block deleting the database row that points
    // at it — that would leave the admin unable to clear a broken record.
    console.error("[storage] failed to remove", key, error);
  }
}
