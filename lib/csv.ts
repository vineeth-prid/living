/**
 * RFC 4180 CSV, which is what "Save as CSV UTF-8" in Excel produces.
 *
 * Written out rather than pulled in as a dependency: the only tricky parts are
 * quoted fields (summaries and addresses contain commas), doubled quotes, and
 * the byte order mark Excel puts at the front — about twenty lines between
 * them.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // Excel writes a BOM; left in, it becomes part of the first header name.
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Trailing blank lines are normal in an exported sheet, not import errors.
  return rows.filter((r) => r.some((value) => value.trim()));
}

/** Quotes a value only when it needs it, the way a spreadsheet writes one. */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) =>
          /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value,
        )
        .join(","),
    )
    .join("\r\n");
}
