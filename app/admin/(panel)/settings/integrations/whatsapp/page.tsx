import Link from "next/link";
import { desc, eq, gte, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import {
  users,
  whatsappCommandExecutions,
  whatsappMessages,
  whatsappSessions,
  whatsappWebhookEvents,
} from "@/lib/db/schema";
import {
  isWhatsAppEnabled,
  whatsappConfigProblems,
} from "@/lib/integrations/whatsapp/config";
import { hasOllama, ollamaModel } from "@/lib/ai/ollama";
import { maskPhone } from "@/lib/integrations/whatsapp/phone";
import { recentMessages } from "@/lib/integrations/whatsapp/service";
import { WhatsAppIntegrationHealthService } from "@/lib/integrations/whatsapp/health";
import {
  Badge,
  Card,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { dateTime } from "@/components/admin/crm";
import { SCOPEABLE_INTENTS } from "@/lib/crm/whatsapp/registry";
import { AccessPanel, ConnectionPanel, TestMessagePanel } from "./panel";

export const metadata = { title: "WhatsApp" };

// §41/§44. Admin-only. Nothing on this page prints the API key or the webhook
// secret — the most it says about either is whether it is set.

export default async function WhatsAppSettingsPage() {
  await requireAdmin();

  const configured = isWhatsAppEnabled();
  const problems = whatsappConfigProblems();
  // Postgres decides what "the last 24 hours" means, not the app server — one
  // clock, and it is the one the rows were written against.
  const dayAgo = sql`now() - interval '24 hours'`;

  const [session] = configured
    ? await db()
        .select()
        .from(whatsappSessions)
        .where(eq(whatsappSessions.provider, "openwa"))
        .limit(1)
    : [null];

  const [staff, messages, [counts], [commandCounts], [lastEvent], health] =
    await Promise.all([
    db()
      .select({
        id: users.id,
        fullName: users.fullName,
        mobile: users.mobile,
        whatsappEnabled: users.whatsappEnabled,
        whatsappCrmEnabled: users.whatsappCrmEnabled,
        whatsappNumber: users.whatsappNumber,
        whatsappScope: users.whatsappScope,
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(users.fullName),
    recentMessages(15),
    db()
      .select({
        inbound: sql<number>`count(*) filter (where ${whatsappMessages.direction} = 'inbound')::int`,
        outbound: sql<number>`count(*) filter (where ${whatsappMessages.direction} = 'outbound')::int`,
        failed: sql<number>`count(*) filter (where ${whatsappMessages.status} = 'failed')::int`,
      })
      .from(whatsappMessages)
      .where(gte(whatsappMessages.createdAt, dayAgo)),
    db()
      .select({
        executed: sql<number>`count(*) filter (where ${whatsappCommandExecutions.status} = 'executed')::int`,
        clarify: sql<number>`count(*) filter (where ${whatsappCommandExecutions.status} = 'awaiting_clarification')::int`,
        failed: sql<number>`count(*) filter (where ${whatsappCommandExecutions.status} in ('failed','rejected'))::int`,
      })
      .from(whatsappCommandExecutions)
      .where(gte(whatsappCommandExecutions.createdAt, dayAgo)),

    // §1. The last delivery of any kind, which is not the same as the last
    // message: a session.status event proves the webhook is wired even when
    // nobody has written in.
    db()
      .select({ receivedAt: whatsappWebhookEvents.receivedAt })
      .from(whatsappWebhookEvents)
      .orderBy(desc(whatsappWebhookEvents.receivedAt))
      .limit(1),

    // §1/§3. Probed live rather than read from the row, so the page says what
    // is true now. Never throws.
    configured
      ? WhatsAppIntegrationHealthService.check()
      : Promise.resolve(null),
  ]);

  const employees = staff.map((employee) => ({
    id: employee.id,
    fullName: employee.fullName,
    whatsappEnabled: employee.whatsappEnabled,
    whatsappCrmEnabled: employee.whatsappCrmEnabled,
    whatsappNumber: employee.whatsappNumber,
    maskedNumber: maskPhone(employee.whatsappNumber ?? employee.mobile),
    scope: employee.whatsappScope ?? [],
  }));

  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle="OpenWA · internal CRM channel"
        action={
          <Badge tone={session?.status === "connected" ? "green" : configured ? "gold" : "neutral"}>
            {configured ? (session?.status ?? "unknown") : "not configured"}
          </Badge>
        }
      />

      {problems.length > 0 && (
        <Card title="Configuration" className="mb-6">
          <ul className="flex flex-col gap-1 text-sm text-stone-600">
            {problems.map((problem) => (
              <li key={problem}>• {problem}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-stone-500">
            Set these in .env.local and restart. Values are never shown here.
          </p>
        </Card>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Received (24h)" value={counts?.inbound ?? 0} />
        <Stat label="Sent (24h)" value={counts?.outbound ?? 0} />
        <Stat label="Commands run (24h)" value={commandCounts?.executed ?? 0} />
        <Stat
          label="Needed clarifying (24h)"
          value={commandCounts?.clarify ?? 0}
          note={
            (commandCounts?.failed ?? 0) > 0
              ? `${commandCounts.failed} refused or failed`
              : undefined
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <ConnectionPanel configured={configured} />

          <Card title="Status">
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Provider" value="OpenWA" />
              <Row label="Session" value={session?.providerSessionId ?? "—"} />
              <Row label="Number" value={maskPhone(session?.phoneNumber)} />
              <Row
                label="Connection status"
                value={configured ? (session?.status ?? "unknown") : "not configured"}
              />
              <Row
                label="Last connected"
                value={
                  session?.lastConnectedAt ? dateTime(session.lastConnectedAt) : "never"
                }
              />
              <Row
                label="Last disconnected"
                value={
                  session?.lastDisconnectedAt
                    ? dateTime(session.lastDisconnectedAt)
                    : "never"
                }
              />
              <Row
                label="Last successful API call"
                value={session?.lastApiOkAt ? dateTime(session.lastApiOkAt) : "never"}
              />
              <Row
                label="Webhook"
                value={
                  session?.webhookConfiguredAt
                    ? `configured ${dateTime(session.webhookConfiguredAt)}`
                    : "not configured from here"
                }
              />
              <Row
                label="Last inbound"
                value={session?.lastInboundAt ? dateTime(session.lastInboundAt) : "never"}
              />
              <Row
                label="Last outbound"
                value={session?.lastOutboundAt ? dateTime(session.lastOutboundAt) : "never"}
              />
              <Row
                label="Last webhook"
                value={lastEvent ? dateTime(lastEvent.receivedAt) : "never"}
              />
              <Row
                label="Interpreter"
                value={hasOllama() ? `Ollama · ${ollamaModel()}` : "not configured"}
              />
            </dl>
            <p className="mt-4 text-xs text-stone-500">
              The WhatsApp connection itself is managed on the VPS. This panel
              reads it and configures the webhook; it never starts or stops a
              session.
            </p>
          </Card>

          <Card title="OpenWA health">
            {!health ? (
              <p className="text-sm text-stone-500">
                Not configured, so there is nothing to probe.
              </p>
            ) : (
              <>
                <dl className="flex flex-col gap-2 text-sm">
                  <Check label="Reachable" ok={health.reachable} />
                  <Check label="API key accepted" ok={health.apiKeyValid} />
                  <Check label="Session found" ok={health.sessionFound} />
                  <Check
                    label="Session connected"
                    ok={health.status === "connected"}
                  />
                </dl>
                {health.error && (
                  <p className="mt-3 rounded-[10px] bg-clay-50 px-3 py-2 text-xs text-clay-800">
                    {health.error}
                  </p>
                )}
              </>
            )}
          </Card>

          <TestMessagePanel employees={employees} />
        </div>

        <div className="flex flex-col gap-6">
          <AccessPanel
            employees={employees}
            scopeOptions={SCOPEABLE_INTENTS.map((entry) => ({
              intent: entry.intent,
              help: entry.help,
            }))}
          />
        </div>
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold text-stone-900">
        Recent messages
      </h2>
      <TableWrap>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Direction</Th>
            <Th>Contact</Th>
            <Th>Message</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {messages.map((message) => (
            <tr key={message.id} className="hover:bg-stone-50">
              <Td className="whitespace-nowrap text-xs text-stone-500">
                {dateTime(message.createdAt)}
              </Td>
              <Td className="text-xs capitalize">{message.direction}</Td>
              <Td className="text-xs">
                {message.contactName ??
                  maskPhone(message.senderPhone ?? message.recipientPhone)}
              </Td>
              <Td className="max-w-[24rem] truncate text-xs text-stone-600">
                {message.text ?? `(${message.messageType})`}
              </Td>
              <Td>
                <Badge
                  tone={
                    message.status === "failed"
                      ? "red"
                      : message.status === "processed"
                        ? "green"
                        : "neutral"
                  }
                >
                  {message.status}
                </Badge>
              </Td>
            </tr>
          ))}
          {messages.length === 0 && (
            <tr>
              <Td colSpan={5} className="py-8 text-center text-sm text-stone-500">
                No WhatsApp traffic yet.
              </Td>
            </tr>
          )}
        </tbody>
      </TableWrap>

      <p className="mt-6 text-xs text-stone-500">
        Every command an employee runs over WhatsApp is recorded against the lead
        or property it touched — see the{" "}
        <Link href="/admin/reports" className="text-pine-700 hover:underline">
          audit log
        </Link>
        .
      </p>
    </>
  );
}

/** A pass/fail line. Distinguishing the four failures is the whole point. */
function Check({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className={ok ? "text-pine-700" : "text-[var(--color-danger)]"}>
        {ok ? "yes" : "no"}
      </dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="mono text-right text-xs text-stone-800">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="rounded-[14px] border border-stone-200 bg-white p-4 shadow-soft">
      <span className="block text-2xl font-semibold text-stone-900">{value}</span>
      <span className="mt-0.5 block text-xs text-stone-500">{label}</span>
      {note && <span className="mt-1 block text-[11px] text-stone-400">{note}</span>}
    </div>
  );
}
