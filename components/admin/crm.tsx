import { Badge, cx } from "./ui";

// Shared CRM vocabulary. The list, pipeline, detail page and dashboard all read
// labels and colours from here, so a status can't be spelled one way in the
// table and another on the board.

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  property_matched: "Property matched",
  site_visit_scheduled: "Site visit scheduled",
  site_visited: "Site visited",
  negotiation: "Negotiation",
  booking: "Booking",
  closed_won: "Closed won",
  closed_lost: "Closed lost",
  on_hold: "On hold",
};

/** The board's left-to-right order (§28). on_hold sits outside the funnel. */
export const PIPELINE_ORDER = [
  "new",
  "contacted",
  "qualified",
  "property_matched",
  "site_visit_scheduled",
  "site_visited",
  "negotiation",
  "booking",
  "closed_won",
  "closed_lost",
] as const;

/** The funnel used for conversion reporting (§33) — excludes lost and hold. */
export const FUNNEL_STEPS = [
  "new",
  "contacted",
  "qualified",
  "site_visit_scheduled",
  "negotiation",
  "booking",
  "closed_won",
] as const;

const STATUS_TONE: Record<string, "neutral" | "blue" | "green" | "gold" | "red"> = {
  new: "blue",
  contacted: "blue",
  qualified: "gold",
  property_matched: "gold",
  site_visit_scheduled: "gold",
  site_visited: "gold",
  negotiation: "gold",
  booking: "green",
  closed_won: "green",
  closed_lost: "red",
  on_hold: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"}>
      {LEAD_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export const PRIORITY_CLASS: Record<string, string> = {
  hot: "bg-[#fbeceb] text-[var(--color-danger)]",
  warm: "bg-clay-50 text-clay-800",
  cold: "bg-[#eaf1f6] text-[var(--color-info)]",
};

export function PriorityTag({ priority }: { priority: string }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
        PRIORITY_CLASS[priority] ?? "bg-stone-100 text-stone-600",
      )}
    >
      {priority}
    </span>
  );
}

/** ₹18.5 L / ₹1.85 Cr — compact enough for a table cell or a card. */
export function inr(value: number | null | undefined): string {
  if (!value) return "—";
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1).replace(/\.0$/, "")} L`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export function budgetRange(min: number | null, max: number | null): string {
  if (!min && !max) return "—";
  if (min && max) return `${inr(min)} – ${inr(max)}`;
  return inr(min ?? max);
}

export const dateTime = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d)
    : "—";

export const dateOnly = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(d) : "—";

/** "Overdue by 2 days" / "in 3 hours" — the only thing a follow-up list needs. */
export function relativeDue(due: Date | null | undefined): {
  label: string;
  overdue: boolean;
} {
  if (!due) return { label: "—", overdue: false };
  const diffMs = due.getTime() - Date.now();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor(abs / 3600000);

  const amount =
    days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${Math.max(hours, 1)} hour${hours === 1 ? "" : "s"}`;

  return { label: overdue ? `Overdue by ${amount}` : `Due in ${amount}`, overdue };
}
