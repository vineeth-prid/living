import { sql } from "drizzle-orm";
import { db, hasDatabase } from "./db";
import { hasSmtp } from "./notify";
import { hasStorage } from "./storage";


// §67. What is up, from the app's point of view.
//
// Every probe answers rather than throws: a health check that crashes when a
// dependency is down is the one thing it must never do. Unconfigured is
// reported as unconfigured, not as broken — this app runs deliberately without
// SMTP or MinIO.

export type HealthRow = { label: string; ok: boolean; detail: string };

async function probe(
  label: string,
  configured: boolean,
  unconfigured: string,
  check: () => Promise<string>,
): Promise<HealthRow> {
  if (!configured) return { label, ok: true, detail: unconfigured };
  try {
    return { label, ok: true, detail: await check() };
  } catch (error) {
    return {
      label,
      ok: false,
      // Truncated: an error from a gateway can carry a page of HTML.
      detail: (error instanceof Error ? error.message : String(error)).slice(0, 140),
    };
  }
}

export async function systemHealth(): Promise<HealthRow[]> {
  return Promise.all([
    probe("Database", hasDatabase(), "seed fixtures (no DATABASE_URL)", async () => {
      await db().execute(sql`select 1`);
      return "healthy";
    }),
    probe("Storage", hasStorage(), "not configured", async () => "configured"),
    probe("Email", hasSmtp(), "not configured", async () => "configured"),
  ]);
}
