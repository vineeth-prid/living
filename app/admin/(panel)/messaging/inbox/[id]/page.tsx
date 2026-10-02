import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { formatPhone } from "@/lib/integrations/whatsapp/phone";
import { getThread } from "@/lib/crm/whatsapp/inbox";
import { Badge, Card, PageHeader, cx } from "@/components/admin/ui";
import { StatusBadge, dateTime } from "@/components/admin/crm";
import { ContactSwitches, ReplyBox } from "./reply";

export const metadata = { title: "Conversation" };

// §B10. One conversation, as a chat.
//
// Every message on this page was already being stored by the integration. The
// only new thing here is the reply box — and it can only ever address the
// contact this thread belongs to, which is what keeps the inbox from becoming a
// way to message an arbitrary number.

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const result = await getThread(id);
  if (!result) notFound();

  const { thread, messages } = result;
  const name =
    thread.leadName ??
    thread.displayName ??
    thread.employeeName ??
    formatPhone(thread.phoneNumber);

  const isAdmin = user.role === "admin";

  return (
    <>
      <Link
        href="/admin/messaging/inbox"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
        Inbox
      </Link>

      <PageHeader
        title={name}
        subtitle={formatPhone(thread.phoneNumber)}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {thread.contactType === "employee" && <Badge tone="blue">staff</Badge>}
            {!thread.isAllowed && <Badge tone="red">silenced</Badge>}
            {thread.optedOutAt && <Badge tone="neutral">opted out</Badge>}
            {thread.leadStatus && <StatusBadge status={thread.leadStatus} />}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[3fr_1fr]">
        <section className="flex max-h-[70vh] flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-white shadow-soft">
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone-500">
                Nothing in this conversation yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {messages.map((message) => {
                  const outbound = message.direction === "outbound";
                  const media = message.mediaMetadata as
                    | { filename?: string | null }
                    | null;

                  return (
                    <li
                      key={message.id}
                      className={cx("flex", outbound ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cx(
                          "max-w-[80%] rounded-[12px] px-3 py-2",
                          outbound
                            ? "bg-pine-50 text-stone-800"
                            : "bg-stone-100 text-stone-800",
                          message.status === "failed" &&
                            "border border-[var(--color-danger)]",
                        )}
                      >
                        {message.messageType !== "text" && (
                          <span className="mb-1 flex items-center gap-1.5 text-[11px] text-stone-500">
                            <Paperclip className="h-3 w-3" />
                            {media?.filename ?? message.messageType}
                          </span>
                        )}
                        <p className="whitespace-pre-wrap text-sm">
                          {message.text ?? `(${message.messageType})`}
                        </p>
                        <span className="mt-1 block text-[10px] text-stone-400">
                          {dateTime(message.sentAt ?? message.createdAt)}
                          {message.status === "failed" && (
                            <span className="ml-1 text-[var(--color-danger)]">
                              · not delivered
                            </span>
                          )}
                          {message.status === "pending" && " · sending"}
                          {message.status === "ignored" && " · not acted on"}
                        </span>
                        {message.error && (
                          <span className="mt-0.5 block text-[10px] text-[var(--color-danger)]">
                            {message.error}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <ReplyBox
            conversationId={thread.id}
            disabled={!thread.isAllowed}
            disabledReason={
              thread.isAllowed
                ? undefined
                : "This number is silenced. Un-silence it before replying."
            }
          />
        </section>

        <div className="flex flex-col gap-6">
          <Card title="Contact">
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Number" value={formatPhone(thread.phoneNumber)} />
              <Row label="WhatsApp name" value={thread.displayName ?? "—"} />
              <Row label="Type" value={thread.contactType} />
              {thread.employeeName && (
                <Row label="Employee" value={thread.employeeName} />
              )}
              <Row
                label="Last message"
                value={thread.lastMessageAt ? dateTime(thread.lastMessageAt) : "—"}
              />
            </dl>
          </Card>

          {thread.leadId && (
            <Card title="Lead">
              <p className="text-sm font-medium text-stone-900">
                {thread.leadName}
              </p>
              <p className="text-xs text-stone-500">{thread.leadReference}</p>
              <Link
                href={`/admin/leads/${thread.leadId}`}
                className="mt-3 inline-block text-xs text-pine-700 hover:underline"
              >
                Open the lead →
              </Link>
            </Card>
          )}

          {thread.propertyId && (
            <Card title="Listing">
              <Link
                href={`/admin/properties/${thread.propertyId}`}
                className="text-xs text-pine-700 hover:underline"
              >
                This thread is about a listing →
              </Link>
            </Card>
          )}

          {isAdmin && thread.contactType !== "employee" && (
            <Card title="Preferences">
              <ContactSwitches
                contactId={thread.contactId}
                phoneNumber={thread.phoneNumber}
                isAllowed={thread.isAllowed}
                optedOut={Boolean(thread.optedOutAt)}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right text-xs text-stone-800">{value}</dd>
    </div>
  );
}

