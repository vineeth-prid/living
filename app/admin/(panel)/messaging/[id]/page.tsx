import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { mediaUrl } from "@/lib/images";
import { maskPhone } from "@/lib/integrations/whatsapp/phone";
import {
  broadcastRecipients,
  getBroadcast,
} from "@/lib/crm/whatsapp/broadcast";
import {
  Badge,
  Card,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { dateTime } from "@/components/admin/crm";
import { BroadcastControls } from "./controls";

export const metadata = { title: "Broadcast" };

// §B7/§B11. The review-and-send screen, and afterwards the receipt.
//
// Deliberately the same page for both. The list the operator approves is the
// list the report is built from, so "who did this actually go to?" is answered
// by the screen they already looked at rather than by a different one that
// might disagree.

export default async function BroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const broadcast = await getBroadcast(id);
  if (!broadcast) notFound();

  const recipients = await broadcastRecipients(id);

  const counts = {
    queued: recipients.filter((r) => r.status === "queued").length,
    sending: recipients.filter((r) => r.status === "sending").length,
    sent: recipients.filter((r) => r.status === "sent").length,
    failed: recipients.filter((r) => r.status === "failed").length,
    skipped: recipients.filter((r) => r.status === "skipped").length,
  };
  // What a send would attempt: everything not already excluded on the way in.
  const sendable = counts.queued + counts.sending + counts.sent + counts.failed;

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
        title={broadcast.name}
        subtitle={`Created ${dateTime(broadcast.createdAt)} by ${broadcast.createdByName ?? "—"}`}
        action={<Badge tone={statusTone(broadcast.status)}>{broadcast.status}</Badge>}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Card title="The message">
          {broadcast.mediaKey && (
            <div className="mb-3 overflow-hidden rounded-[10px] border border-stone-200 bg-stone-50">
              {broadcast.mediaMimeType?.startsWith("image/") ? (
                /* A plain img: the key is served by /media, which is already an
                   origin-local route, so there is nothing for next/image to
                   add here beyond a second fetch of the same bytes. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={mediaUrl(broadcast.mediaKey)}
                  alt=""
                  className="max-h-72 w-full object-contain"
                />
              ) : broadcast.mediaMimeType?.startsWith("video/") ? (
                <video
                  src={mediaUrl(broadcast.mediaKey)}
                  controls
                  className="max-h-72 w-full bg-black object-contain"
                />
              ) : (
                <a
                  href={mediaUrl(broadcast.mediaKey)}
                  className="block px-4 py-6 text-center text-sm text-pine-700 hover:underline"
                >
                  {broadcast.mediaFilename ?? "Attachment"}
                </a>
              )}
            </div>
          )}
          <p className="whitespace-pre-wrap text-sm text-stone-800">
            {broadcast.body}
          </p>
          {broadcast.mediaKind && (
            <p className="mt-3 text-xs text-stone-500">
              Goes out as one WhatsApp {broadcast.mediaKind} with this text as the
              caption.
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card title={broadcast.status === "draft" ? "Send" : "Progress"}>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Sent" value={counts.sent} tone="green" />
              <Stat label="Queued" value={counts.queued + counts.sending} />
              <Stat label="Failed" value={counts.failed} tone="red" />
              <Stat label="Skipped" value={counts.skipped} />
            </div>
            <BroadcastControls
              id={broadcast.id}
              status={broadcast.status}
              sendable={sendable}
              failed={counts.failed}
              stuck={counts.sending}
            />
            {broadcast.completedAt && (
              <p className="mt-3 text-xs text-stone-500">
                Finished {dateTime(broadcast.completedAt)}.
              </p>
            )}
          </Card>

          {counts.skipped > 0 && (
            <Card title="Why some were skipped">
              <p className="text-xs text-stone-500">
                These were never messaged. They are listed below with the reason
                so the numbers in this report add up.
              </p>
            </Card>
          )}
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-stone-900">
        Recipients ({recipients.length})
      </h2>
      <TableWrap>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Number</Th>
            <Th>Status</Th>
            <Th>Detail</Th>
            <Th>Sent</Th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((recipient) => (
            <tr key={recipient.id} className="hover:bg-stone-50">
              <Td className="text-xs">
                {recipient.leadId ? (
                  <Link
                    href={`/admin/leads/${recipient.leadId}`}
                    className="text-stone-800 hover:text-pine-700"
                  >
                    {recipient.name ?? "—"}
                  </Link>
                ) : (
                  (recipient.name ?? "—")
                )}
                {recipient.leadReference && (
                  <span className="ml-2 text-stone-400">
                    {recipient.leadReference}
                  </span>
                )}
              </Td>
              <Td className="mono whitespace-nowrap text-xs text-stone-600">
                {recipient.phoneNumber.startsWith("unusable:")
                  ? "—"
                  : maskPhone(recipient.phoneNumber)}
              </Td>
              <Td>
                <Badge tone={recipientTone(recipient.status)}>
                  {recipient.status}
                </Badge>
              </Td>
              <Td className="max-w-[22rem] truncate text-xs text-stone-500">
                {recipient.reason ??
                  (recipient.attempts > 1 ? `${recipient.attempts} attempts` : "")}
              </Td>
              <Td className="whitespace-nowrap text-xs text-stone-500">
                {recipient.sentAt ? dateTime(recipient.sentAt) : "—"}
              </Td>
            </tr>
          ))}
          {recipients.length === 0 && (
            <tr>
              <Td colSpan={5} className="py-8 text-center text-sm text-stone-500">
                No recipients on this broadcast.
              </Td>
            </tr>
          )}
        </tbody>
      </TableWrap>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "red";
}) {
  return (
    <div className="rounded-[10px] border border-stone-200 p-3">
      <span
        className={
          tone === "green"
            ? "block text-xl font-semibold text-pine-700"
            : tone === "red" && value > 0
              ? "block text-xl font-semibold text-[var(--color-danger)]"
              : "block text-xl font-semibold text-stone-900"
        }
      >
        {value}
      </span>
      <span className="text-xs text-stone-500">{label}</span>
    </div>
  );
}

function statusTone(status: string) {
  if (status === "completed") return "green" as const;
  if (status === "sending") return "blue" as const;
  if (status === "cancelled") return "red" as const;
  if (status === "paused") return "gold" as const;
  return "neutral" as const;
}

function recipientTone(status: string) {
  if (status === "sent") return "green" as const;
  if (status === "failed") return "red" as const;
  if (status === "sending") return "blue" as const;
  if (status === "skipped") return "neutral" as const;
  return "gold" as const;
}
