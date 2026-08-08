import type { Metadata } from "next";
import { Cormorant, Schibsted_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/nav";
import { SiteFooter } from "@/components/footer";
import { site } from "@/lib/site";

const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});
const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Premium Property & NRI Services in Kochi | Living by ITR",
    template: "%s · Living",
  },
  description: site.description,
  applicationName: site.name,
  // No title/description/url here on purpose — anything set becomes a default
  // every page inherits, which is how og:url ends up hardcoded to the homepage.
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-IN"
      className={`${cormorant.variable} ${schibsted.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
        <SiteNav />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
