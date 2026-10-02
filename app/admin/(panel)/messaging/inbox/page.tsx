import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { maskPhone } from "@/lib/integrations/whatsapp/phone";
import { listThreads, threadCounts, type ThreadFilter } from "@/lib/crm/whatsapp/inbox";
import {
  Badge,
  EmptyState,
  PageHeader,
  cx,
  filterClass,
} from "@/components/admin/ui";
import { dateTime } from "@/components/admin/crm";

export const metadata = { title: "Inbox" };

// §B10. Every WhatsApp conversation, and whether anyone has replied to it.
//
// requireUser, not requireAdmin: answering a customer is the job, and an
// employee who cannot see the question cannot answer it. Broadcasting is the
// admin-only part, and it lives on the page above this one.

const FILTERS: { key: ThreadFilter; label: string }[] = [
  { key: "unanswered", label: "Needs a reply" },
  { key: "all", label: "All" },
  { key: "customers", label: "Customers" },
  { key: "employees", label: "Staff" },
];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const filter = (FILTERS.some((entry) => entry.key === params.filter)
    ? params.filter
    : "unanswered") as ThreadFilter;
  const q = params.q?.trim() || undefined;

  const [threads, counts] = await Promise.all([
    listThreads({ filter, q }),
    threadCounts(),
  ]);

  const countFor = (key: ThreadFilter) =>
    key === "all"
      ? counts.total
      : key === "customers"
        ? counts.customers
        : key === "employees"
          ? counts.employees
          : counts.unanswered;

  return (
    <>
      <Link
        href="/admin/messaging"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        Messaging
      </Link>

      <PageHeader
        title="Inbox"
        subtitle={`${counts.unanswered} waiting on a reply`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((entry) => (
          <Link
            key={entry.key}
            href={`/admin/messaging/inbox?filter=${entry.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={cx(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              filter === entry.key
                ? "border-pine-600 bg-pine-600 text-white"
                : "border-stone-300 bg-white text-stone-600 hover:border-stone-400",
            )}
          >
            {entry.label} ({countFor(entry.key)})
          </Link>
        ))}

        {/* A GET form, so a filtered inbox is a shareable URL. */}
        <form method="get" className="ml-auto flex items-center gap-2">
          <input type="hidden" name="filter" value={filter} />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, number or reference…"
            className={cx(filterClass, "w-56")}
          />
          <button
            type="submit"
            className="h-9 shrink-0 rounded-[8px] bg-pine-600 px-4 text-sm font-medium text-white transition hover:bg-pine-700"
          >
            Search
          </button>
        </form>
      </div>

      {threads.length === 0 ? (
        <EmptyState
          title={q ? "Nothing matched" : "No conversations here"}
          hint={
            filter === "unanswered"
              ? "Every thread has had a reply. Switch to All to see the rest."
              : "WhatsApp conversations appear here as soon as someone writes in."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map((thread) => {
            const name =
              thread.leadName ??
              thread.displayName ??
              thread.employeeName ??
              maskPhone(thread.phoneNumber);
            const waiting = thread.lastDirection === "inbound";

            return (
              <li key={thread.id}>
                <Link
                  href={`/admin/messaging/inbox/${thread.id}`}
                  className={cx(
                    "flex items-start gap-3 rounded-[12px] border bg-white px-4 py-3 shadow-soft transition hover:border-stone-300",
                    waiting ? "border-l-[3px] border-l-pine-600 border-stone-200" : "border-stone-200",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-stone-900">
                        {name}
                      </span>
                      {thread.leadReference && (
                        <span className="text-xs text-stone-400">
                          {thread.leadReference}
                        </span>
                      )}
                      {thread.contactType === "employee" && (
                        <Badge tone="blue">staff</Badge>
                      )}
                      {!thread.isAllowed && <Badge tone="red">silenced</Badge>}
                      {thread.optedOutAt && <Badge tone="neutral">opted out</Badge>}
                    </div>
                    <p className="mt-1 truncate text-xs text-stone-500">
                      {thread.lastDirection === "outbound" && (
                        <span className="text-stone-400">You: </span>
                      )}
                      {thread.lastMessage ?? "(no text)"}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="block text-[11px] text-stone-400">
                      {thread.lastMessageAt ? dateTime(thread.lastMessageAt) : "—"}
                    </span>
                    {waiting && (
                      <span className="mt-1 inline-block text-[11px] font-medium text-pine-700">
                        needs a reply
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
