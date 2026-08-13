import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/footer";
import { JsonLd } from "@/components/schema";
import { site } from "@/lib/site";

// The public website's chrome. It lives here rather than in the root layout so
// /admin renders without a marketing header and footer — those overlapped the
// panel's own controls and swallowed clicks.

const orgSchema = {
  "@context": "https://schema.org",
  "@type": ["Organization", "RealEstateAgent", "LocalBusiness"],
  // Stable @id so other pages' schema can reference this entity.
  "@id": `${site.url}/#organization`,
  name: site.name,
  legalName: site.legalName,
  parentOrganization: { "@type": "Organization", name: site.parent },
  url: site.url,
  logo: `${site.url}/logo.png`,
  image: `${site.url}/opengraph-image`,
  slogan: site.tagline,
  description: site.description,
  telephone: site.phoneRaw,
  email: site.email,
  sameAs: site.sameAs,
  areaServed: [
    { "@type": "City", name: "Kochi" },
    { "@type": "City", name: "Ernakulam" },
    { "@type": "Place", name: "Kakkanad" },
    { "@type": "State", name: "Kerala" },
  ],
  address: {
    "@type": "PostalAddress",
    streetAddress: site.address.line,
    addressLocality: site.address.city,
    addressRegion: site.address.region,
    addressCountry: site.address.country,
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: site.geo.lat,
    longitude: site.geo.lng,
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      opens: "09:30",
      closes: "18:30",
    },
  ],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Living Services",
    itemListElement: [
      "Property Buying",
      "Property Selling",
      "NRI Property Concierge",
      "Community & Facility Management Platform",
    ].map((name) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name },
    })),
  },
};

export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <JsonLd data={orgSchema} />
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
