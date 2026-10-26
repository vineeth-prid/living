import Link from "next/link";
import { isNotNull, sql } from "drizzle-orm";
import { Inbox, MessageCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { isWhatsAppEnabled } from "@/lib/integrations/whatsapp/config";
import { aiRepliesEnabled } from "@/lib/crm/whatsapp/assistant";
import { hasStorage } from "@/lib/storage";
import { employeeOptions, leadSourceOptions } from "@/lib/leads.admin";
import {
  AUDIENCE_PRESETS,
  optedOutContacts,
} from "@/lib/crm/whatsapp/audience";
import {
  listBroadcasts,
  mediaDelivery,
  queuedTotal,
  releaseDueBroadcasts,
  scheduledBroadcasts,
} from "@/lib/crm/whatsapp/broadcast";
import {
  HEARTBEAT_STALE_MINUTES,
  broadcastHeartbeat,
} from "@/lib/crm/whatsapp/scheduler";
import { maskPhone } from "@/lib/integrations/whatsapp/phone";
import { formatDateTime, istDate, istDatePlusDays } from "@/lib/time";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { dateTime } from "@/components/admin/crm";
import { Composer } from "./composer";
import { OptOutRow, QueueControls, SchedulerHealth } from "./queue";

export const metadata = { title: "Messaging" };

// §B6. Admin-only. Bulk sending on the business's own WhatsApp number is not a
// permission to hand out — see the note at the top of actions.ts.

export default async function MessagingPage() {
  await requireAdmin();

  const configured = isWhatsAppEnabled();

  /**
   * §S3. Opening this page is itself a scheduler trigger.
   *
   * Cheap — one conditional UPDATE that matches nothing most of the time — and
   * it means an admin who notices a broadcast is overdue fixes it by looking at
   * the page. Combined with the inbound webhook, the cron is the primary
   * trigger rather than the only one, which is the whole answer to "the cron
   * must not fail": it can, and the schedule still moves.
   */
  if (configured) await releaseDueBroadcasts();

  // The date pickers in the composer offer Kochi dates, not the browser's — a
  // laptop in Dubai must not be allowed to pick a date that is already over
  // here, and a component may not read a clock during render anyway.
  const today = istDate();
  const tomorrow = istDatePlusDays(1);

  // Where the gateway will fetch attachments from, printed below the queue.
  const delivery = mediaDelivery();

  const [
    broadcasts,
    queued,
    scheduled,
    heartbeat,
    optOuts,
    employees,
    sources,
    cities,
  ] = await Promise.all([
      listBroadcasts(20),
      queuedTotal(),
      scheduledBroadcasts(),
      broadcastHeartbeat(),
      optedOutContacts(),
      employeeOptions(),
      leadSourceOptions(),
      // Whatever cities the leads actually have, rather than a hardcoded list
      // that goes stale the first time the business sells outside Ernakulam.
      db()
        .select({ city: leads.city })
        .from(leads)
        .where(isNotNull(leads.city))
        .groupBy(leads.city)
        .orderBy(sql`count(*) desc`)
        .limit(25),
    ]);

  return (
    <>
      <PageHeader
        title="Messaging"
        subtitle="WhatsApp broadcasts and conversations"
        action={
          <div className="flex items-center gap-2">
            <Badge tone={configured ? "green" : "neutral"}>
              {configured ? "WhatsApp connected" : "not configured"}
            </Badge>
            <Badge tone={aiRepliesEnabled() ? "blue" : "neutral"}>
              {aiRepliesEnabled() ? "auto-replies on" : "auto-replies off"}
            </Badge>
            <LinkButton href="/admin/messaging/inbox" size="sm">
              <Inbox className="h-4 w-4" strokeWidth={1.8} />
              Inbox
            </LinkButton>
          </div>
        }
      />

      <div className="mb-6">
        <Composer
          presets={Object.entries(AUDIENCE_PRESETS).map(([key, preset]) => ({
            key,
            label: preset.label,
            help: preset.help,
          }))}
          employees={employees.map((employee) => ({
            value: employee.id,
            label: employee.fullName,
          }))}
          sources={sources.map((source) => ({
            value: source.key,
            label: source.label,
          }))}
          cities={cities
            .map((row) => row.city)
            .filter((city): city is string => Boolean(city))}
          configured={configured}
          storageReady={hasStorage()}
          today={today}
          tomorrow={tomorrow}
        />
      </div>

      <Card title="Queue and scheduler" className="mb-6">
        <div className="flex flex-col gap-4">
          <SchedulerHealth
            lastRunLabel={relative(heartbeat.lastRunAt)}
            lastOkLabel={relative(heartbeat.lastOkAt)}
            stale={heartbeat.stale}
            neverRun={heartbeat.neverRun}
            lastError={heartbeat.lastError}
            consecutiveFailures={heartbeat.consecutiveFailures}
            staleAfterMinutes={HEARTBEAT_STALE_MINUTES}
          />

          <QueueControls queued={queued} scheduled={scheduled.length} />

          {/* Visible because it being invisible cost a day: APP_BASE_URL unset
              on staging made every broadcast fetch its image from production,
              and nothing anywhere said so. */}
          <p className="text-xs text-stone-500">
            Attachments are delivered{" "}
            {delivery.transport === "base64" ? (
              <>
                <strong>inline</strong> — the gateway does not fetch anything
              </>
            ) : (
              <>
                by URL from{" "}
                <span className="mono text-stone-700">{delivery.origin}</span> —
                the gateway must be able to reach that host over HTTPS
              </>
            )}
            .
          </p>

          {scheduled.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-stone-200 pt-3">
              {scheduled.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <Link
                    href={`/admin/messaging/${entry.id}`}
                    className="font-medium text-stone-800 hover:text-pine-700"
                  >
                    {entry.name}
                  </Link>
                  <span className="text-stone-500">
                    {entry.totalCount - entry.skippedCount} recipients ·{" "}
                    {entry.scheduledFor ? formatDateTime(entry.scheduledFor) : "—"}
                    {entry.overdue && (
                      <span className="ml-1 text-[var(--color-danger)]">
                        · overdue
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-stone-900">Broadcasts</h2>
      {broadcasts.length === 0 ? (
        <EmptyState
          title="No broadcasts yet"
          hint="Write one above. Nothing is sent until you have seen the recipient list."
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Sent</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>By</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((broadcast) => {
              const attempted = broadcast.sentCount + broadcast.failedCount;
              return (
                <tr key={broadcast.id} className="hover:bg-stone-50">
                  <Td>
                    <Link
                      href={`/admin/messaging/${broadcast.id}`}
                      className="font-medium text-stone-900 hover:text-pine-700"
                    >
                      {broadcast.name}
                    </Link>
                    <span className="mt-0.5 block max-w-[22rem] truncate text-xs text-stone-500">
                      {broadcast.mediaKind ? `[${broadcast.mediaKind}] ` : ""}
                      {broadcast.body}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {broadcast.sentCount} of {broadcast.totalCount - broadcast.skippedCount}
                    {broadcast.failedCount > 0 && (
                      <span className="ml-1 text-[var(--color-danger)]">
                        · {broadcast.failedCount} failed
                      </span>
                    )}
                    {broadcast.skippedCount > 0 && (
                      <span className="ml-1 text-stone-400">
                        · {broadcast.skippedCount} skipped
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(broadcast.status)}>
                      {broadcast.status}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-stone-500">
                    {dateTime(broadcast.createdAt)}
                  </Td>
                  <Td className="text-xs text-stone-500">
                    {broadcast.createdByName ?? "—"}
                  </Td>
                  <Td className="text-right">
                    <Link
                      href={`/admin/messaging/${broadcast.id}`}
                      className="text-xs text-pine-700 hover:underline"
                    >
                      {broadcast.status === "draft"
                        ? "Review and send"
                        : attempted > 0
                          ? "Report"
                          : "Open"}
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      <Card title="Opted out" className="mt-6">
        {optOuts.length === 0 ? (
          <p className="text-sm text-stone-500">
            Nobody has asked to stop receiving broadcasts. Replying{" "}
            <span className="mono text-xs">STOP</span> adds them here, and they
            are excluded from every audience automatically.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-stone-500">
              Excluded from every broadcast. They can still message in and get a
              reply — this silences offers, not the conversation.
            </p>
            <ul className="flex flex-col">
              {optOuts.map((contact) => (
                <OptOutRow
                  key={contact.id}
                  phoneNumber={contact.phoneNumber}
                  label={`${contact.displayName ?? "Unknown"} · ${maskPhone(contact.phoneNumber)}${
                    contact.optedOutAt ? ` · ${dateTime(contact.optedOutAt)}` : ""
                  }`}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-stone-500">
        <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.8} />
        The connection, the webhook and employee access live on the{" "}
        <Link
          href="/admin/settings/integrations/whatsapp"
          className="text-pine-700 hover:underline"
        >
          WhatsApp settings page
        </Link>
        .
      </p>
    </>
  );
}

function statusTone(status: string) {
  if (status === "scheduled") return "blue" as const;
  if (status === "completed") return "green" as const;
  if (status === "sending") return "blue" as const;
  if (status === "cancelled") return "red" as const;
  if (status === "paused") return "gold" as const;
  return "neutral" as const;
}


/**
 * "4 minutes ago", for the heartbeat line.
 *
 * Relative rather than absolute on purpose: the question this answers is "is it
 * running?", and "11:42" needs the reader to work out what time it is now
 * before it means anything.
 */
function relative(at: Date | null): string {
  if (!at) return "never";

  const seconds = Math.round((Date.now() - at.getTime()) / 1000);
  if (seconds < 90) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  // Past a day and a half, the date is more use than a count of hours.
  return formatDateTime(at);
}
