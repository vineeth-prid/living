// Upserts the starting content. Safe to re-run — it updates rows in place
// rather than duplicating them, so created_at survives.
//   npm run db:seed
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import {
  leadActivities,
  leadNotes,
  leadProperties,
  leadSources,
  leadTypes,
  leads,
  properties,
} from "../lib/db/schema";
import { propertySeed } from "../lib/properties.seed";
import {
  extraPropertySeed,
  leadSeed,
  leadSourceSeed,
  leadTypeSeed,
} from "../lib/crm.seed";

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

  // A loop of small statements beats a clever single-statement upsert.
  for (const { id, ...fields } of [...propertySeed, ...extraPropertySeed]) {
    await db
      .insert(properties)
      .values({ id, ...fields })
      .onConflictDoUpdate({
        target: properties.id,
        set: { ...fields, updatedAt: new Date() },
      });
    console.log(`  property ${id}`);
  }

  for (const type of leadTypeSeed) {
    await db
      .insert(leadTypes)
      .values(type)
      .onConflictDoUpdate({ target: leadTypes.key, set: { label: type.label } });
  }
  console.log(`  ${leadTypeSeed.length} lead types`);

  for (const source of leadSourceSeed) {
    await db
      .insert(leadSources)
      .values(source)
      .onConflictDoUpdate({
        target: leadSources.key,
        set: { label: source.label },
      });
  }
  console.log(`  ${leadSourceSeed.length} lead sources`);

  // Leads are matched on mobile so re-running doesn't pile up duplicates of
  // the same fictional person.
  let created = 0;
  for (const { interestedIn = [], notes = [], ...fields } of leadSeed) {
    const [existing] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.mobile, fields.mobile))
      .limit(1);
    if (existing) continue;

    const id = randomUUID();
    const reference = `LEAD-${String(9000 + created + 1)}`;
    await db.insert(leads).values({ ...fields, id, reference });

    await db.insert(leadActivities).values({
      id: randomUUID(),
      leadId: id,
      kind: "created",
      summary: "Lead captured from the website",
    });

    if (fields.initialMessage) {
      await db.insert(leadNotes).values({
        id: randomUUID(),
        leadId: id,
        body: fields.initialMessage,
        kind: "initial",
      });
    }

    for (const body of notes) {
      await db.insert(leadNotes).values({
        id: randomUUID(),
        leadId: id,
        body,
        kind: "note",
      });
    }

    for (const propertyId of interestedIn) {
      await db
        .insert(leadProperties)
        .values({ id: randomUUID(), leadId: id, propertyId })
        .onConflictDoNothing();
    }

    created += 1;
    console.log(`  lead ${fields.name}`);
  }

  console.log(
    `seeded ${propertySeed.length + extraPropertySeed.length} properties, ${created} new leads`,
  );
  console.log(
    "Properties seeded as drafts — publish them from /admin/properties to put them on the site.",
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
