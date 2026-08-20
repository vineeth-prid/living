import type { Metadata } from "next";

// Single source of truth for site-wide facts (contact, nav, brand).
export const site = {
  name: "Living",
  legalName: "Living by ITR",
  parent: "ITR Group",
  tagline: "Life Happens Here.",
  description:
    "Living is a premium PropTech ecosystem by ITR Group — property sales, NRI concierge, and a complete platform for apartment communities across Ernakulam, Kochi and Kerala.",
  url: "https://livingbyitr.com",
  locale: "en_IN",
  phone: "8089 00 55 00",
  phoneRaw: "+918089005500",
  whatsapp: "918089005500",
  email: "talktous@livingbyitr.com",
  address: {
    line: "Living, Kakkanad Head Office",
    city: "Ernakulam",
    region: "Kerala",
    country: "IN",
  },
  hours: "Mon – Sat · 9:30 to 6:30",
  // Kakkanad, Ernakulam approx.
  geo: { lat: 10.0159, lng: 76.3419 },
  sameAs: [
    "https://www.facebook.com/itrgroups.kochi/",
    "https://www.instagram.com/itr_groups/",
  ],
} as const;

// Per-page metadata: unique title + description, canonical, and matching OG.
// `metadataBase` in the root layout turns the relative paths into absolute URLs.
export function pageMeta(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    // Mirrors the rendered <title>, which the root `%s · Living` template builds.
    openGraph: { title: `${title} · ${site.name}`, description, url: path },
  };
}

/**
 * The primary navigation.
 *
 * `children` turns an item into a menu. Services has three distinct offers
 * that were only reachable by landing on the page and scrolling — naming them
 * in the nav is the difference between "they have services" and "they do the
 * thing I came for".
 *
 * The parent stays a real link in every case: a menu that cannot be clicked
 * strands anyone on a touch screen or a keyboard.
 */
export const nav = [
  { label: "Home", href: "/" },
  {
    label: "Our services",
    href: "/services",
    children: [
      {
        label: "Property buying",
        href: "/services#buying",
        blurb: "Find a home in Kochi, with someone on your side.",
      },
      {
        label: "Sell your property",
        href: "/services#selling",
        blurb: "Valuation, photography, marketing and the closing.",
      },
      {
        label: "NRI concierge",
        href: "/services#nri",
        blurb: "Your property looked after while you are abroad.",
      },
    ],
  },
  { label: "Platform", href: "/platform" },
  { label: "About Living", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

export type NavItem = (typeof nav)[number];

/**
 * Where staff review a listing that is not on the website.
 *
 * Deliberately an admin path: a draft has no public URL and must not be given
 * one. Anything under /admin is behind the session check, so a link that
 * leaks goes to a login screen rather than to an unpublished listing.
 */
export const adminPropertyUrl = (id: string) =>
  `${site.url}/admin/properties/${id}`;

export const waLink = (msg?: string) =>
  `https://wa.me/${site.whatsapp}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
export const telLink = `tel:${site.phoneRaw}`;
export const mailLink = `mailto:${site.email}`;
