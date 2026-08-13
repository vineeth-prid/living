import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { leadSources, leadTypes } from "@/lib/db/schema";
import { hasStorage } from "@/lib/storage";
import { Card, PageHeader } from "@/components/admin/ui";
import { TaxonomyEditor } from "./taxonomy-editor";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();

  const [types, sources] = await Promise.all([
    db().select().from(leadTypes).orderBy(asc(leadTypes.sortOrder), asc(leadTypes.label)),
    db().select().from(leadSources).orderBy(asc(leadSources.sortOrder), asc(leadSources.label)),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="CRM configuration. Changes take effect immediately."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <TaxonomyEditor kind="type" title="Lead types" entries={types} />
        <TaxonomyEditor kind="source" title="Lead sources" entries={sources} />

        <Card title="Media storage" className="lg:col-span-2">
          <p className="text-sm text-stone-600">
            {hasStorage()
              ? "MinIO is configured. Uploads from the property editor go straight to the bucket."
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
