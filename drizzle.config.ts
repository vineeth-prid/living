import { defineConfig } from "drizzle-kit";

// Node's built-in dotenv reader — no dependency needed. Next loads .env.local
// itself; the drizzle-kit CLI does not.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local — fine for `db:generate`, which needs no connection.
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
