import type { NextConfig } from "next";
import { SERVER_ACTION_BODY_LIMIT } from "./lib/upload-limits";

/**
 * The deployed image bucket, named here and not only read from the environment.
 *
 * This file is evaluated twice — once by `next build`, and again by
 * `next start` — and the two do not have to see the same environment.
 * NEXT_PUBLIC_IMAGE_CDN is inlined into the client bundle at build time, so
 * every page ships absolute CDN URLs whatever the server later holds. When the
 * variable was missing from the *runtime* environment this allowlist came out
 * empty, and the optimizer answered each of those URLs with
 * 400 "url" parameter is not allowed.
 *
 * That is precisely how the homepage services images went blank while the rest
 * of the site carried on: they are the only images routed through next/image
 * from the CDN. Everything else is either a plain <img> (ZoomImage) or
 * same-origin through /media, and neither consults this list.
 *
 * A hostname already inlined into a public bundle is not a secret, and an
 * allowlist that empties itself when a variable goes missing is not an
 * allowlist. So production is a constant, and the environment can still add to
 * it for staging or a future bucket.
 */
const DEPLOYED_CDN = "https://media.livingbyitr.com/living-images-prod";

/** A trailing slash is one ops typo away, and it breaks path matching. */
const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const cdnBases = [
  ...new Set(
    [process.env.NEXT_PUBLIC_IMAGE_CDN, DEPLOYED_CDN]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => trimTrailingSlashes(value.trim())),
  ),
];

/**
 * Plain objects rather than `new URL()`.
 *
 * Next accepts either — the URL shorthand is documented and works — but the
 * object form is what makes the normalised pathname visible at the point it is
 * built, which is the part that actually has to be right.
 */
const imageRemotePatterns = cdnBases.flatMap((base) => {
  try {
    const url = new URL(base);
    const protocol = url.protocol.replace(":", "");
    if (protocol !== "http" && protocol !== "https") return [];
    return [
      {
        protocol,
        hostname: url.hostname,
        // "" for a default port, which is what Next expects.
        port: url.port,
        pathname: `${trimTrailingSlashes(url.pathname)}/images/**`,
      } as const,
    ];
  } catch {
    // A malformed value must not take the build down. The constant above still
    // covers production, so the site keeps its images either way.
    console.warn(`[next.config] ignoring unparseable image CDN base: ${base}`);
    return [];
  }
});

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    remotePatterns: imageRemotePatterns,
  },
  experimental: {
    serverActions: {
      // Property media goes through a Server Action, and the default cap is
      // 1 MB — below any real photograph. Read from lib/upload-limits so this
      // and the per-file checks in lib/storage.ts cannot drift apart again.
      bodySizeLimit: SERVER_ACTION_BODY_LIMIT,
    },
  },
};

export default nextConfig;
