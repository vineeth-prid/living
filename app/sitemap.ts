import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { nav } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return nav.map((n) => ({
    url: `${site.url}${n.href === "/" ? "" : n.href}`,
    lastModified: now,
    changeFrequency: n.href === "/" ? "weekly" : "monthly",
    priority: n.href === "/" ? 1 : 0.8,
  }));
}
