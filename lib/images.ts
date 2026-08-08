// Imagery lives in MinIO. NEXT_PUBLIC_IMAGE_CDN is the bucket's public base
// URL, no trailing slash (e.g. https://minio.yourhost.com/living-images).
// Left unset, paths stay relative and resolve against /public for local dev,
// so the site still runs offline without the bucket.
// ponytail: these are still premium placeholders standing in for the real
// Living shoot. Replace the objects in the bucket and every caller follows.
const CDN = process.env.NEXT_PUBLIC_IMAGE_CDN ?? "";

/** Turn a bucket-relative path into a URL the browser can fetch. */
export const cdnUrl = (path: string) => `${CDN}${path}`;

// Bare, bucket-relative paths. These are what get stored — in Postgres rows
// and in the seed — so the same data works across local, staging and prod.
export const imagePaths = {
  // Home
  heroArch: "/images/hero-kochi-home.jpg",
  storyLiving: "/images/story-living-room.jpg",
  storyDetail: "/images/story-detail.jpg",
  storyMorning: "/images/story-morning.jpg",

  // Services
  buying: "/images/services-buying.jpg",
  selling: "/images/services-selling.jpg",
  nri: "/images/services-nri.jpg",

  // About
  legacy: "/images/about-legacy.jpg",
  city: "/images/about-city.jpg",

  // Contact
  office: "/images/contact-office.jpg",
} as const;

/** Render-ready URLs for the static section imagery components reference. */
export const img = Object.fromEntries(
  Object.entries(imagePaths).map(([key, path]) => [key, cdnUrl(path)]),
) as Record<keyof typeof imagePaths, string>;
