import Link from "next/link";
import { CalendarClock, Flame, Inbox, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import {
  followupsFor,
  upcomingSiteVisits,
  workspaceSummary,
} from "@/lib/leads.admin";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  cx,
} from "@/components/admin/ui";
import {
  PriorityTag,
  StatusBadge,
  budgetRange,
  dateTime,
  relativeDue,
} from "@/components/admin/crm";

export const metadata = { title: "My Workspace" };

/**
 * §35 — the employee landing page. Operational only: what to do today and who
 * to call. No revenue, no company-wide totals, no conversion analytics. Admins
 * can open it too; it just shows their own work.
 */
export default async function WorkspacePage() {
  const user = await requireUser();

  const [summary, followups, siteVisits] = await Promise.all([
    workspaceSummary(user),
    followupsFor(user, "mine", "pending"),
    upcomingSiteVisits(user),
  ]);

  const today = followups.filter((f) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return f.dueAt <= end;
  });

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.fullName.split(" ")[0]}`}
        subtitle="Your leads and what needs doing today."
        action={<LinkButton href="/admin/leads/new" variant="primary">Add lead</LinkButton>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Inbox} label="My leads" value={summary.assigned} href="/admin/leads?mine=1" />
        <Stat icon={Flame} label="New, not yet contacted" value={summary.fresh} href="/admin/leads?mine=1&status=new" />
        <Stat icon={CalendarClock} label="Follow-ups today" value={summary.dueToday} href="/admin/followups" />
        <Stat
          icon={TriangleAlert}
          label="Overdue"
          value={summary.overdue}
          href="/admin/followups"
          alert={summary.overdue > 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Follow-ups due"
          action={<Link href="/admin/followups" className="text-xs text-pine-700 hover:underline">See all</Link>}
        >
          {today.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing due today. </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {today.slice(0, 8).map((f) => {
                const due = relativeDue(f.dueAt);
                return (
                  <li key={f.id} className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/admin/leads/${f.leadId}`} className="text-sm font-medium text-stone-900 hover:text-pine-700">
                        {f.leadName}
                      </Link>
                      <p className="text-xs capitalize text-stone-500">
                        {f.kind.replace(/_/g, " ")} · {dateTime(f.dueAt)}
                      </p>
                    </div>
                    <span className={cx("shrink-0 text-xs", due.overdue ? "text-[var(--color-danger)]" : "text-stone-400")}>
                      {due.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Upcoming site visits">
          {siteVisits.length === 0 ? (
            <p className="text-sm text-stone-500">None scheduled.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {siteVisits.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/leads/${v.leadId}`} className="text-sm font-medium text-stone-900 hover:text-pine-700">
                    {v.leadName}
                  </Link>
                  <span className="text-xs text-stone-500">{dateTime(v.dueAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recently updated"
          className="lg:col-span-2"
          action={<Link href="/admin/leads?mine=1" className="text-xs text-pine-700 hover:underline">All my leads</Link>}
        >
          {summary.recent.length === 0 ? (
            <EmptyState
              title="No leads assigned to you yet"
              hint="New enquiries from the website are assigned by an administrator."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-stone-100">
              {summary.recent.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-[10rem]">
                    <Link href={`/admin/leads/${lead.id}`} className="text-sm font-medium text-stone-900 hover:text-pine-700">
                      {lead.name}
                    </Link>
                    <span className="mono ml-2 text-[11px] text-stone-400">{lead.reference}</span>
                  </div>
                  <span className="text-xs text-stone-500">{budgetRange(lead.budgetMin, lead.budgetMax)}</span>
                  <PriorityTag priority={lead.priority} />
                  <StatusBadge status={lead.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
  alert,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "flex items-center gap-3 rounded-[14px] border bg-white p-4 shadow-soft transition hover:border-pine-300",
        alert ? "border-[var(--color-danger)]/40" : "border-stone-200",
      )}
    >
      <span
        className={cx(
          "flex h-9 w-9 items-center justify-center rounded-full",
          alert ? "bg-[#fbeceb] text-[var(--color-danger)]" : "bg-pine-50 text-pine-700",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <span>
        <span className="block text-xl font-semibold text-stone-900">{value}</span>
        <span className="block text-xs text-stone-500">{label}</span>
      </span>
    </Link>
  );
}
