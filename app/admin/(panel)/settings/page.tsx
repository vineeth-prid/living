import { asc, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import {
  expenseCategories,
  leadSources,
  leadTypes,
  notifications,
} from "@/lib/db/schema";
import { hasStorage } from "@/lib/storage";
import { hasSmtp, teamRecipients } from "@/lib/notify";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { dateTime } from "@/components/admin/crm";
import { TaxonomyEditor } from "./taxonomy-editor";
import { SmtpPanel } from "./smtp-panel";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const admin = await requireAdmin();

  const [types, sources, categories, recent] = await Promise.all([
    db().select().from(leadTypes).orderBy(asc(leadTypes.sortOrder), asc(leadTypes.label)),
    db().select().from(leadSources).orderBy(asc(leadSources.sortOrder), asc(leadSources.label)),
    db()
      .select()
      .from(expenseCategories)
      .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.label)),
    db()
      .select({
        id: notifications.id,
        event: notifications.event,
        recipient: notifications.recipient,
        subject: notifications.subject,
        status: notifications.status,
        error: notifications.error,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(15),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="CRM configuration. Changes take effect immediately."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SmtpPanel
          configured={hasSmtp()}
          host={process.env.SMTP_HOST ?? null}
          from={process.env.SMTP_FROM ?? null}
          team={teamRecipients()}
          defaultEmail={admin.email}
        />

        <Card title="Recent notifications">
          {recent.length === 0 ? (
            <p className="text-sm text-stone-500">
              Nothing sent yet. Every attempt is recorded here, including ones
              skipped because SMTP isn&apos;t configured.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recent.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-800">{n.subject}</p>
                    <p className="truncate text-xs text-stone-400">
                      {n.recipient} · {dateTime(n.createdAt)}
                    </p>
                    {n.error && n.status === "failed" && (
                      <p className="mt-0.5 text-xs text-[var(--color-danger)]">
                        {n.error}
                      </p>
                    )}
                  </div>
                  <Badge
                    tone={
                      n.status === "sent"
                        ? "green"
                        : n.status === "failed"
                          ? "red"
                          : "neutral"
                    }
                  >
                    {n.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <TaxonomyEditor kind="type" title="Lead types" entries={types} />
        <TaxonomyEditor kind="source" title="Lead sources" entries={sources} />
        <TaxonomyEditor
          kind="expense_category"
          title="Expense categories"
          entries={categories}
        />

        <Card title="Media storage">
          <p className="text-sm text-stone-600">
            {hasStorage()
              ? "MinIO is configured. Uploads from the property editor and expense receipts go straight to the bucket."
              : "MinIO isn't configured yet. Set MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY and MINIO_SECRET_KEY in .env.local to enable uploads."}
          </p>
          <p className="mt-3 text-xs text-stone-500">
            Public delivery keeps using NEXT_PUBLIC_IMAGE_CDN — the same URL the
            website has always read from. Storage keys are bucket-relative, so
            the same rows work across local, staging and production.
          </p>
        </Card>
      </div>
    </>
  );
}
