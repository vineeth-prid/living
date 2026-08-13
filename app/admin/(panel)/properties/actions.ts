"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { properties, propertyMedia, MEDIA_KINDS } from "@/lib/db/schema";
import {
  can,
  fail,
  requireUser,
  succeed,
  type ActionResult,
} from "@/lib/auth/dal";
import { PERMISSIONS } from "@/lib/auth/constants";
import { audit, changedFields } from "@/lib/audit";
import { newId, nextReference, slugify } from "@/lib/ids";
import {
  priceLabelFor,
  propertySchema,
  publishBlockers,
} from "@/lib/validation/property";
import { latestPropertyReference } from "@/lib/properties.admin";
import { deleteObject, uploadObject, validateUpload } from "@/lib/storage";

// Public pages are cached; anything that changes what the site shows has to
// invalidate them or a published listing won't appear until the next deploy.
function revalidatePublic(id?: string) {
  revalidatePath("/");
  revalidatePath("/services");
  revalidatePath("/homes");
  if (id) revalidatePath(`/homes/${id}`);
  revalidatePath("/sitemap.xml");
}

function parse(formData: FormData) {
  return propertySchema.safeParse({
    ...Object.fromEntries(formData),
    amenities: formData
      .getAll("amenities")
      .map(String)
      .flatMap((v) => v.split("\n"))
      .map((v) => v.trim())
      .filter(Boolean),
  });
}

/** Slug collisions get a numeric suffix rather than failing the save. */
async function uniqueId(base: string): Promise<string> {
  let candidate = base || `listing-${Date.now()}`;
  for (let n = 2; n < 50; n++) {
    const [clash] = await db()
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.id, candidate))
      .limit(1);
    if (!clash) return candidate;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export async function createProperty(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  }
  const input = parsed.data;

  const id = await uniqueId(slugify(input.name, input.locality));
  const reference = nextReference("LIV", await latestPropertyReference());
  const askingPrice = input.askingPrice ?? 0;

  await db()
    .insert(properties)
    .values({
      id,
      reference,
      name: input.name,
      locality: input.locality,
      city: input.city,
      type: input.type,
      summary: input.summary,
      description: input.description,
      kind: input.kind,
      listingType: input.listingType,
      status: input.status,

      priceLabel: input.priceLabel ?? priceLabelFor(askingPrice) ?? "On request",
      priceValue: askingPrice,
      askingPrice: input.askingPrice ?? null,
      priceUnit: input.priceUnit ?? "INR",
      rentalIncome: input.rentalIncome ?? null,
      rentalFrequency: input.rentalFrequency,
      rentalYield: input.rentalYield ?? null,
      // Rule 3 + §40: a user without the permission cannot set this, even by
      // adding the field to the request by hand.
      finalPrice: can(actor, PERMISSIONS.propertyFinalPrice)
        ? (input.finalPrice ?? null)
        : null,
      internalNotes: input.internalNotes,
      sellerName: input.sellerName,
      sellerContact: input.sellerContact,

      beds: input.beds ?? 0,
      baths: input.baths ?? 0,
      area: input.area ?? "",
      amenities: input.amenities,
      details: [],
      gallery: [],

      addressLine: input.addressLine,
      addressIsPublic: input.addressIsPublic,
      district: input.district,
      state: input.state ?? "Kerala",
      pincode: input.pincode,
      country: input.country ?? "India",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,

      landArea: input.landArea ?? null,
      landAreaUnit: input.landAreaUnit,
      surveyNumber: input.surveyNumber,
      roadAccess: input.roadAccess,
      facing: input.facing,
      boundaryNotes: input.boundaryNotes,

      hasBuilding: input.hasBuilding,
      builtUpArea: input.builtUpArea ?? null,
      builtUpAreaUnit: input.builtUpAreaUnit,
      floors: input.floors ?? null,
      units: input.units ?? null,
      balconies: input.balconies ?? null,
      parking: input.parking,
      propertyAge: input.propertyAge,
      furnishedStatus: input.furnishedStatus,

      commercialKind: input.commercialKind,
      floorNumber: input.floorNumber,
      occupancy: input.occupancy,
      suitableFor: input.suitableFor,
      leasePotential: input.leasePotential,

      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,

      // Rule 1: created is never published.
      workflowStatus: "draft",
      isPublic: false,
      createdById: actor.id,
      updatedById: actor.id,
    });

  await audit({
    actorId: actor.id,
    action: "property.created",
    entity: "property",
    entityId: id,
    after: { reference, name: input.name },
  });

  revalidatePath("/admin/properties");
  return succeed({ id });
}

export async function updateProperty(
  id: string,
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireUser();
  const parsed = parse(formData);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  }
  const input = parsed.data;

  const [before] = await db()
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);
  if (!before) return fail("That property no longer exists.");

  const askingPrice = input.askingPrice ?? before.priceValue;

  await db()
    .update(properties)
    .set({
      name: input.name,
      locality: input.locality,
      city: input.city,
      type: input.type,
      summary: input.summary,
      description: input.description,
      kind: input.kind,
      listingType: input.listingType,
      status: input.status,

      priceLabel: input.priceLabel ?? priceLabelFor(askingPrice) ?? before.priceLabel,
      priceValue: askingPrice,
      askingPrice: input.askingPrice ?? null,
      priceUnit: input.priceUnit ?? "INR",
      rentalIncome: input.rentalIncome ?? null,
      rentalFrequency: input.rentalFrequency,
      rentalYield: input.rentalYield ?? null,
      // Without the permission the existing value is preserved untouched —
      // not read, not echoed to the form, not overwritten with null.
      ...(can(actor, PERMISSIONS.propertyFinalPrice)
        ? { finalPrice: input.finalPrice ?? null }
        : {}),
      internalNotes: input.internalNotes,
      sellerName: input.sellerName,
      sellerContact: input.sellerContact,

      beds: input.beds ?? 0,
      baths: input.baths ?? 0,
      area: input.area ?? "",
      amenities: input.amenities,

      addressLine: input.addressLine,
      addressIsPublic: input.addressIsPublic,
      district: input.district,
      state: input.state ?? "Kerala",
      pincode: input.pincode,
      country: input.country ?? "India",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,

      landArea: input.landArea ?? null,
      landAreaUnit: input.landAreaUnit,
      surveyNumber: input.surveyNumber,
      roadAccess: input.roadAccess,
      facing: input.facing,
      boundaryNotes: input.boundaryNotes,

      hasBuilding: input.hasBuilding,
      builtUpArea: input.builtUpArea ?? null,
      builtUpAreaUnit: input.builtUpAreaUnit,
      floors: input.floors ?? null,
      units: input.units ?? null,
      balconies: input.balconies ?? null,
      parking: input.parking,
      propertyAge: input.propertyAge,
      furnishedStatus: input.furnishedStatus,

      commercialKind: input.commercialKind,
      floorNumber: input.floorNumber,
      occupancy: input.occupancy,
      suitableFor: input.suitableFor,
      leasePotential: input.leasePotential,

      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,

      updatedById: actor.id,
      updatedAt: sql`now()`,
    })
    .where(eq(properties.id, id));

  const diff = changedFields(before as Record<string, unknown>, {
    name: input.name,
    priceValue: askingPrice,
    city: input.city,
    status: input.status,
  });
  await audit({
    actorId: actor.id,
    action: "property.updated",
    entity: "property",
    entityId: id,
    before: diff.before,
    after: diff.after,
  });

  revalidatePath(`/admin/properties/${id}`);
  revalidatePath("/admin/properties");
  if (before.isPublic) revalidatePublic(id);
  return succeed({ id });
}

/**
 * Publish / unpublish (§11). Employees need an explicit grant; admins always
 * qualify. Checked here rather than in the page, because the page only hides
 * a button.
 */
export async function setPublished(
  id: string,
  publish: boolean,
): Promise<ActionResult<null>> {
  const actor = await requireUser();
  if (!can(actor, PERMISSIONS.propertyPublish)) {
    return fail("Only an administrator can publish a listing.");
  }

  const [row] = await db()
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);
  if (!row) return fail("That property no longer exists.");

  if (publish) {
    const [{ mediaCount }] = await db()
      .select({ mediaCount: sql<number>`count(*)::int` })
      .from(propertyMedia)
      .where(
        and(
          eq(propertyMedia.propertyId, id),
          eq(propertyMedia.kind, "image"),
          eq(propertyMedia.isPublic, true),
        ),
      );

    const blockers = publishBlockers({ ...row, mediaCount });
    if (blockers.length) return fail(blockers.join(" "));
  }

  await db()
    .update(properties)
    .set({
      workflowStatus: publish ? "published" : "draft",
      isPublic: publish,
      publishedAt: publish ? (row.publishedAt ?? new Date()) : row.publishedAt,
      updatedById: actor.id,
      updatedAt: sql`now()`,
    })
    .where(eq(properties.id, id));

  await audit({
    actorId: actor.id,
    action: publish ? "property.published" : "property.unpublished",
    entity: "property",
    entityId: id,
  });

  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}`);
  revalidatePublic(id);
  return succeed(null);
}

/** Workflow moves that aren't publish/unpublish (reserved, sold, rented…). */
export async function setWorkflowStatus(
  id: string,
  status: (typeof properties.workflowStatus)["_"]["data"],
): Promise<ActionResult<null>> {
  const actor = await requireUser();

  const [row] = await db()
    .select({ workflowStatus: properties.workflowStatus, isPublic: properties.isPublic })
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);
  if (!row) return fail("That property no longer exists.");

  // Sold, rented and off-market listings come off the website automatically —
  // leaving them live is how a portal ends up advertising unavailable stock.
  const hidden = ["sold", "rented", "off_market", "archived"].includes(status);

  await db()
    .update(properties)
    .set({
      workflowStatus: status,
      isPublic: hidden ? false : row.isPublic,
      updatedById: actor.id,
      updatedAt: sql`now()`,
    })
    .where(eq(properties.id, id));

  await audit({
    actorId: actor.id,
    action: `property.status.${status}`,
    entity: "property",
    entityId: id,
    before: { workflowStatus: row.workflowStatus },
    after: { workflowStatus: status },
  });

  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${id}`);
  revalidatePublic(id);
  return succeed(null);
}

/** Rule 12: archive, never destroy. The row and its history stay. */
export async function archiveProperty(id: string): Promise<ActionResult<null>> {
  const actor = await requireUser();
  await db()
    .update(properties)
    .set({
      workflowStatus: "archived",
      isPublic: false,
      deletedAt: new Date(),
      updatedById: actor.id,
      updatedAt: sql`now()`,
    })
    .where(eq(properties.id, id));

  await audit({
    actorId: actor.id,
    action: "property.archived",
    entity: "property",
    entityId: id,
  });
  revalidatePath("/admin/properties");
  revalidatePublic(id);
  return succeed(null);
}

// --- media ----------------------------------------------------------------

export async function uploadMedia(
  propertyId: string,
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const actor = await requireUser();

  const kind = z
    .enum(MEDIA_KINDS)
    .catch("image")
    .parse(formData.get("kind"));
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return fail("Choose at least one file.");

  // Validate everything before uploading anything, so a rejected third file
  // doesn't leave two orphans in the bucket.
  for (const file of files) {
    const error = validateUpload(file, kind);
    if (error) return fail(error);
  }

  const [{ maxOrder }] = await db()
    .select({ maxOrder: sql<number>`coalesce(max(${propertyMedia.sortOrder}), -1)::int` })
    .from(propertyMedia)
    .where(eq(propertyMedia.propertyId, propertyId));

  const [{ existing }] = await db()
    .select({ existing: sql<number>`count(*)::int` })
    .from(propertyMedia)
    .where(and(eq(propertyMedia.propertyId, propertyId), eq(propertyMedia.kind, "image")));

  let order = maxOrder;
  let imageIndex = existing;

  for (const file of files) {
    const key = await uploadObject(file, `properties/${propertyId}`);
    order += 1;
    await db()
      .insert(propertyMedia)
      .values({
        id: newId(),
        propertyId,
        kind,
        storageKey: key,
        // Documents and sketches are internal by default (§10).
        isPublic: kind === "image" || kind === "floor_plan",
        isPrimary: kind === "image" && imageIndex === 0,
        sortOrder: order,
        sizeBytes: file.size,
        contentType: file.type,
      });
    if (kind === "image") imageIndex += 1;
  }

  await audit({
    actorId: actor.id,
    action: "property.media_uploaded",
    entity: "property",
    entityId: propertyId,
    after: { count: files.length, kind },
  });

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePublic(propertyId);
  return succeed(null);
}

export async function deleteMedia(mediaId: string): Promise<ActionResult<null>> {
  const actor = await requireUser();

  const [media] = await db()
    .select()
    .from(propertyMedia)
    .where(eq(propertyMedia.id, mediaId))
    .limit(1);
  if (!media) return fail("That file is already gone.");

  await db().delete(propertyMedia).where(eq(propertyMedia.id, mediaId));
  await deleteObject(media.storageKey);

  // Never leave a property with images but no primary.
  if (media.isPrimary) {
    const [next] = await db()
      .select({ id: propertyMedia.id })
      .from(propertyMedia)
      .where(
        and(eq(propertyMedia.propertyId, media.propertyId), eq(propertyMedia.kind, "image")),
      )
      .orderBy(propertyMedia.sortOrder)
      .limit(1);
    if (next) {
      await db()
        .update(propertyMedia)
        .set({ isPrimary: true })
        .where(eq(propertyMedia.id, next.id));
    }
  }

  await audit({
    actorId: actor.id,
    action: "property.media_deleted",
    entity: "property",
    entityId: media.propertyId,
  });

  revalidatePath(`/admin/properties/${media.propertyId}`);
  revalidatePublic(media.propertyId);
  return succeed(null);
}

export async function reorderMedia(
  propertyId: string,
  orderedIds: string[],
): Promise<ActionResult<null>> {
  await requireUser();
  await Promise.all(
    orderedIds.map((id, index) =>
      db()
        .update(propertyMedia)
        .set({ sortOrder: index })
        .where(and(eq(propertyMedia.id, id), eq(propertyMedia.propertyId, propertyId))),
    ),
  );
  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePublic(propertyId);
  return succeed(null);
}

export async function setPrimaryMedia(
  propertyId: string,
  mediaId: string,
): Promise<ActionResult<null>> {
  await requireUser();
  await db()
    .update(propertyMedia)
    .set({ isPrimary: false })
    .where(eq(propertyMedia.propertyId, propertyId));
  await db()
    .update(propertyMedia)
    .set({ isPrimary: true })
    .where(and(eq(propertyMedia.id, mediaId), eq(propertyMedia.propertyId, propertyId)));

  revalidatePath(`/admin/properties/${propertyId}`);
  revalidatePublic(propertyId);
  return succeed(null);
}

export async function setMediaVisibility(
  mediaId: string,
  isPublic: boolean,
): Promise<ActionResult<null>> {
  await requireUser();
  const [media] = await db()
    .select({ propertyId: propertyMedia.propertyId })
    .from(propertyMedia)
    .where(eq(propertyMedia.id, mediaId))
    .limit(1);
  if (!media) return fail("That file is already gone.");

  await db()
    .update(propertyMedia)
    .set({ isPublic })
    .where(eq(propertyMedia.id, mediaId));

  revalidatePath(`/admin/properties/${media.propertyId}`);
  revalidatePublic(media.propertyId);
  return succeed(null);
}

export async function createAndEdit(
  prev: ActionResult<{ id: string }> | null,
  formData: FormData,
) {
  const result = await createProperty(prev, formData);
  if (result.ok) redirect(`/admin/properties/${result.data.id}?created=1`);
  return result;
}
