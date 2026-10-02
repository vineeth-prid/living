import { requireUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import {
  MAX_EXPORT,
  buildCsv,
  exportFilename,
  exportRows,
} from "@/lib/properties.export";
import type { PropertyFilters } from "@/lib/properties.admin";

// §E2. The download.
//
// A route handler rather than a Server Action, because a file download is what
// browsers already do with a GET and a Content-Disposition header. The action
// version has to build the string, hand it back through RPC, wrap it in a Blob,
// make an object URL, click a hidden anchor and revoke the URL — all to arrive
// at what a plain link does on its own.
//
// It also means the export honours the URL the operator is already looking at:
// the list page keeps its filters in the query string, so "export what I can
// see" is the same parameters pointed at a different path.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Same gate as the properties list itself (§41). Everything in the file is
  // something this person can already open one listing at a time — except
  // finalPrice, which buildCsv drops unless they hold the permission.
  const viewer = await requireUser();

  const params = new URL(request.url).searchParams;

  // A ticked selection, as the table's form posts it: ?ids=a&ids=b. Comma-
  // separated is accepted too, so the URL can be shortened or typed by hand.
  const ids = [
    ...params.getAll("ids").flatMap((value) => value.split(",")),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  const filters: PropertyFilters = {
    q: params.get("q") ?? undefined,
    status: (params.get("status") as PropertyFilters["status"]) ?? "all",
    kind: params.get("kind") ?? undefined,
    listingType: params.get("listingType") ?? undefined,
    city: params.get("city") ?? undefined,
  };

  const { rows, extras } = await exportRows({ filters, ids });

  if (rows.length === 0) {
    // A spreadsheet with a header row and nothing under it looks like a broken
    // export. Saying so plainly is more use than a file that explains nothing.
    return new Response(
      ids.length > 0
        ? "None of the selected properties could be exported."
        : "No properties match those filters, so there is nothing to export.",
      { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const { csv, headers, rowCount } = buildCsv(rows, extras, viewer);

  // §37. Bulk extraction of seller contacts is exactly the kind of thing that
  // needs to be answerable afterwards, so what left and who took it is on the
  // record — including which columns, since the empty ones are dropped and the
  // shape therefore varies between exports.
  await audit({
    actorId: viewer.id,
    action: "property.exported",
    entity: "property",
    after: {
      rowCount,
      columns: headers.length,
      headers,
      selection: ids.length > 0 ? ids.length : null,
      filters: ids.length > 0 ? null : filters,
      truncated: rowCount >= MAX_EXPORT,
    },
  });

  return new Response(`﻿${csv}`, {
    headers: {
      // The BOM is what makes Excel open it as UTF-8 rather than mangling the
      // rupee sign and the non-ASCII locality names — same as the template.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(ids.length > 0)}"`,
      "Cache-Control": "no-store",
    },
  });
}
