// Upserts the starting listings. Safe to re-run — it updates rows in place
// rather than duplicating them, so created_at survives.
//   npm run db:seed
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { properties } from "../lib/db/schema";
import { propertySeed } from "../lib/properties.seed";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local — fall back to whatever is already in the environment (CI).
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in .env.local");

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  // Four rows — a loop of four statements beats a clever single-statement upsert.
  for (const { id, ...fields } of propertySeed) {
    await db
      .insert(properties)
      .values({ id, ...fields })
      .onConflictDoUpdate({
        target: properties.id,
        set: { ...fields, updatedAt: new Date() },
      });
    console.log(`  upserted ${id}`);
  }

  console.log(`seeded ${propertySeed.length} properties`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
