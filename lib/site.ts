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
} as const;

export const nav = [
  { label: "Home", href: "/" },
  { label: "Our services", href: "/services" },
  { label: "Platform", href: "/platform" },
  { label: "About Living", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

export const waLink = (msg?: string) =>
  `https://wa.me/${site.whatsapp}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
export const telLink = `tel:${site.phoneRaw}`;
export const mailLink = `mailto:${site.email}`;
