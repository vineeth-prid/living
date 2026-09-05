/**
 * Paging a list of listings.
 *
 * Pure functions, no React: the page number arrives from a query string, which
 * means it arrives from a stranger. "?page=-4", "?page=abc" and "?page=99" are
 * all things a crawler will ask for, and none of them may produce an empty grid
 * or a crash — they resolve to a real page or to the first one.
 */

/** Three across on a wide screen, four rows deep. */
export const PROPERTIES_PER_PAGE = 12;

export function totalPages(count: number, perPage = PROPERTIES_PER_PAGE): number {
  if (!Number.isFinite(count) || count <= 0) return 1;
  return Math.max(1, Math.ceil(count / perPage));
}

/** Whatever was in the query string, as a page that exists. */
export function currentPage(
  raw: string | string[] | undefined,
  pages: number,
): number {
  const text = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(text ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, Math.max(1, pages));
}

/** The slice of items that page shows. */
export function pageSlice<T>(
  items: T[],
  page: number,
  perPage = PROPERTIES_PER_PAGE,
): T[] {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

/**
 * The page numbers worth drawing: the first, the last, and a window around
 * where you are. "gap" is an ellipsis.
 *
 * Without this, forty listings pages render as forty buttons that wrap onto
 * three lines.
 */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  const out: (number | "gap")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (keep.has(p)) out.push(p);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
}

/** Page one keeps the clean URL, so /homes never competes with /homes?page=1. */
export function pageHref(basePath: string, page: number, anchor = ""): string {
  return `${basePath}${page > 1 ? `?page=${page}` : ""}${anchor}`;
}
