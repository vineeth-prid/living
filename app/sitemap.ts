import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { nav } from "@/lib/site";
import { getPropertySlugs } from "@/lib/properties";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const pages: MetadataRoute.Sitemap = nav.map((n) => ({
    url: `${site.url}${n.href === "/" ? "" : n.href}`,
    lastModified: now,
    changeFrequency: n.href === "/" ? "weekly" : "monthly",
    priority: n.href === "/" ? 1 : 0.8,
  }));

  // Published listings only — getPropertySlugs applies the same visibility
  // filter as the pages themselves, so a draft can't be advertised here.
  const listings = await getPropertySlugs();

  return [
    ...pages,
    {
      url: `${site.url}/homes`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...listings.map((listing) => ({
      url: `${site.url}/homes/${listing.id}`,
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
