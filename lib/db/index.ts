import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Reused across HMR reloads in dev, otherwise every edit leaks a pool.
const globalForDb = globalThis as unknown as { __livingDb?: Db };

// Lazy: importing this module must not require DATABASE_URL, so pages that
// never touch the database still build.
export function db(): Db {
  if (globalForDb.__livingDb) return globalForDb.__livingDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at Postgres.",
    );
  }

  const instance = drizzle(new Pool({ connectionString: url }), { schema });
  globalForDb.__livingDb = instance;
  return instance;
}

export const hasDatabase = () => Boolean(process.env.DATABASE_URL);
