import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // /admin is noindex at the page level too. Disallowing it here keeps
    // crawlers from requesting it at all — safe to do because it has never
    // been indexed, so there's no stale entry that needs a crawl to clear.
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
