import type { NextConfig } from "next";

// Imagery is served from object storage; allow the optimizer to fetch from
// exactly that bucket and nothing else. Unset (local dev) means no remote
// hosts are permitted at all, which is the safe default.
const cdn = process.env.NEXT_PUBLIC_IMAGE_CDN;

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    remotePatterns: cdn ? [new URL(`${cdn}/images/**`)] : [],
  },
};

export default nextConfig;
