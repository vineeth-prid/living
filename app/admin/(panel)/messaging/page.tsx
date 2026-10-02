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
import { listBroadcasts, queuedTotal } from "@/lib/crm/whatsapp/broadcast";
import { maskPhone } from "@/lib/integrations/whatsapp/phone";
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
import { OptOutRow, QueueControls } from "./queue";

export const metadata = { title: "Messaging" };

// §B6. Admin-only. Bulk sending on the business's own WhatsApp number is not a
// permission to hand out — see the note at the top of actions.ts.

export default async function MessagingPage() {
  await requireAdmin();

  const configured = isWhatsAppEnabled();

  const [broadcasts, queued, optOuts, employees, sources, cities] =
    await Promise.all([
      listBroadcasts(20),
      queuedTotal(),
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
        />
      </div>

      <Card title="Queue" className="mb-6">
        <QueueControls queued={queued} />
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
  if (status === "completed") return "green" as const;
  if (status === "sending") return "blue" as const;
  if (status === "cancelled") return "red" as const;
  if (status === "paused") return "gold" as const;
  return "neutral" as const;
}

