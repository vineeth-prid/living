import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { can, requireUser } from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/constants";
import { getAdminProperty } from "@/lib/properties.admin";
import { hasStorage } from "@/lib/storage";
import { db } from "@/lib/db";
import { leadProperties, leads, auditLogs } from "@/lib/db/schema";
import {
  Badge,
  Card,
  PageHeader,
  cx,
} from "@/components/admin/ui";
import { PropertyForm } from "../property-form";
import { updateProperty } from "../actions";
import { MediaManager } from "./media-manager";
import { PublishPanel } from "./publish-panel";

export const metadata = { title: "Edit property" };

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // finalPrice is stripped inside this query for anyone without the
  // permission — the page never has to remember to hide it.
  const property = await getAdminProperty(id, user);
  if (!property) notFound();

  // §19 reverse direction: leads interested in this property.
  const interested = await db()
    .select({
      id: leads.id,
      name: leads.name,
      reference: leads.reference,
      status: leads.status,
      priority: leads.priority,
    })
    .from(leadProperties)
    .innerJoin(leads, eq(leads.id, leadProperties.leadId))
    .where(eq(leadProperties.propertyId, id))
    .orderBy(desc(leadProperties.createdAt))
    .limit(20);

  const history = await db()
    .select({
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, "property"), eq(auditLogs.entityId, id)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  const action = updateProperty.bind(null, id);
  const publicImages = property.media.filter(
    (m) => m.kind === "image" && m.isPublic,
  ).length;

  return (
    <>
      <PageHeader
        title={property.name}
        subtitle={`${property.reference ?? "No reference"} · ${property.locality}, ${property.city}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={property.isPublic ? "green" : "neutral"}>
              {property.isPublic ? "Live on site" : "Not on site"}
            </Badge>
            <Badge tone="neutral">
              <span className="capitalize">
                {property.workflowStatus.replace(/_/g, " ")}
              </span>
            </Badge>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <PropertyForm
            action={action}
            submitLabel="Save changes"
            canSetFinalPrice={can(user, PERMISSIONS.propertyFinalPrice)}
            initial={property as unknown as Record<string, unknown>}
          />

          <MediaManager
            propertyId={id}
            storageReady={hasStorage()}
            media={property.media.map((m) => ({
              id: m.id,
              kind: m.kind,
              url: m.url,
              storageKey: m.storageKey,
              caption: m.caption,
              isPublic: m.isPublic,
              isPrimary: m.isPrimary,
            }))}
          />
        </div>

        <aside className="flex flex-col gap-6">
          <PublishPanel
            id={id}
            isPublic={property.isPublic}
            workflowStatus={property.workflowStatus}
            canPublish={can(user, PERMISSIONS.propertyPublish)}
            publicImages={publicImages}
          />

          <Card title={`Interested leads (${interested.length})`}>
            {interested.length === 0 ? (
              <p className="text-sm text-stone-500">
                No enquiries against this property yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {interested.map((lead) => (
                  <li key={lead.id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="text-sm text-stone-800 hover:text-pine-700"
                    >
                      {lead.name}
                      <span className="mono ml-1.5 text-[11px] text-stone-400">
                        {lead.reference}
                      </span>
                    </Link>
                    <span
                      className={cx(
                        "text-[11px] capitalize",
                        lead.priority === "hot"
                          ? "text-[var(--color-danger)]"
                          : "text-stone-400",
                      )}
                    >
                      {lead.status.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="History">
            {history.length === 0 ? (
              <p className="text-sm text-stone-500">Nothing recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {history.map((entry, i) => (
                  <li key={i} className="text-xs">
                    <span className="block text-stone-800">{entry.action}</span>
                    <span className="text-stone-400">
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
