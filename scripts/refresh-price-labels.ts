/**
 * Rewrites stored price labels into the current shorthand.
 *
 *   npm run db:refresh-prices
 *
 * `properties.price_label` is a denormalised display string, written once when
 * a listing is saved. Changing the format therefore only affects new saves —
 * without this, rows written before the change keep showing "₹1.85 Cr" next to
 * newer ones showing "₹1.85Cr".
 *
 * Safe to re-run: it recomputes from `price_value`, which is the number of
 * record, and only writes rows whose label actually differs. Rows with no
 * price keep whatever they had ("On request" and the like).
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";
import { priceLabelFor } from "@/lib/validation/property";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("No DATABASE_URL — nothing to do.");
    return;
  }

  const rows = await db()
    .select({
      id: properties.id,
      reference: properties.reference,
      priceValue: properties.priceValue,
      priceLabel: properties.priceLabel,
    })
    .from(properties);

  let changed = 0;

  for (const row of rows) {
    const next = priceLabelFor(row.priceValue ?? undefined);
    // No price means no computed label; leave whatever is there alone rather
    // than overwriting "On request" with an empty string.
    if (!next || next === row.priceLabel) continue;

    await db()
      .update(properties)
      .set({ priceLabel: next })
      .where(eq(properties.id, row.id));

    console.log(`  ${row.reference ?? row.id}: ${row.priceLabel} → ${next}`);
    changed += 1;
  }

  console.log(
    `\n${changed} of ${rows.length} label${rows.length === 1 ? "" : "s"} rewritten.`,
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
