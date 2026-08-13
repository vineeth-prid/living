// Dependency-free on purpose. Both the proxy (which runs in the edge runtime)
// and client components need these names, and importing them from session.ts or
// dal.ts would drag `pg` into bundles that can't load it.

export const SESSION_COOKIE = "living_session";

export const PERMISSIONS = {
  /** Publish or unpublish a listing without an admin. */
  propertyPublish: "property.publish",
  /** See properties.finalPrice — internal, §9. */
  propertyFinalPrice: "property.final_price",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
