import { requireUser } from "@/lib/auth/dal";
import { toCsv } from "@/lib/csv";
import { templateRows } from "@/lib/validation/property-import";

// Generated rather than kept as a file in /public so the headers can't drift
// away from what the importer actually accepts.
export async function GET() {
  await requireUser();

  return new Response(`﻿${toCsv(templateRows())}`, {
    headers: {
      // The BOM above is what makes Excel open it as UTF-8 rather than mangling
      // the rupee sign and any non-ASCII locality names.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="living-properties-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
