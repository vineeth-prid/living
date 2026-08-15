// One place both the uploader and the framework read.
//
// Server Actions cap the request body at 1 MB by default, and lib/storage.ts
// was independently allowing 12 MB images. The framework won the argument
// before the action ever ran, so every real property photo failed with a
// generic error and nothing reached MinIO. Two numbers that had to agree and
// nothing making them.
//
// Deliberately dependency-free: next.config.ts imports this, and pulling the
// minio client into the build config would be a bad trade.

const MB = 1024 * 1024;

export const UPLOAD_LIMITS = {
  image: 12 * MB,
  /**
   * Well under what WhatsApp itself allows. A Server Action buffers the whole
   * body in memory before the handler sees it, so a 200 MB video would take the
   * server down rather than upload slowly.
   * ponytail: raise this only alongside a direct-to-MinIO presigned upload,
   * which is the real answer for large files.
   */
  video: 48 * MB,
  document: 25 * MB,
} as const;

export type UploadGroup = keyof typeof UPLOAD_LIMITS;

/**
 * What the whole request may weigh.
 *
 * The media manager accepts several files at once, so this is a batch ceiling
 * rather than a per-file one, plus room for multipart boundaries and part
 * headers — 10–20 KB is the usual overhead, and this leaves far more.
 */
export const SERVER_ACTION_BODY_LIMIT = 64 * MB;

/** For messages: "12 MB" rather than "12582912". */
export const asMb = (bytes: number) => `${Math.round(bytes / MB)} MB`;
