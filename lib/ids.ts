import { randomUUID } from "node:crypto";

export const newId = () => randomUUID();

/**
 * Sequential business references — LIV-0042, LEAD-0042.
 *
 * ponytail: derived from `max(existing) + 1` inside the caller's transaction
 * rather than a Postgres sequence. Two references can only collide if two
 * creates interleave, and the unique index turns that into a retry rather than
 * a duplicate. Move to a real sequence if creates ever go concurrent enough to
 * make that retry visible.
 */
export function nextReference(prefix: string, latest: string | null): string {
  const n = latest ? Number(latest.split("-").pop()) : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

/** URL slug for a property id, e.g. "The Arbour" + "Kakkanad" → the-arbour-kakkanad. */
export function slugify(...parts: string[]): string {
  return parts
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
