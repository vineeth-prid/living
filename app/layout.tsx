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
    default: "Living — Life Happens Here. | Premium property & living, Kerala",
    template: "%s · Living",
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "property management Ernakulam",
    "property management Kochi",
    "luxury apartments Kochi",
    "NRI property management Kerala",
    "property sales Ernakulam",
    "facility management Kochi",
    "apartment management Ernakulam",
    "home services Ernakulam",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: site.locale,
    url: site.url,
    siteName: site.name,
    title: "Living — Life Happens Here.",
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Living — Life Happens Here.",
    description: site.description,
  },
  robots: { index: true, follow: true },
};

const orgSchema = {
  "@context": "https://schema.org",
  "@type": ["Organization", "RealEstateAgent", "LocalBusiness"],
  name: site.name,
  legalName: site.legalName,
  parentOrganization: { "@type": "Organization", name: site.parent },
  url: site.url,
  slogan: site.tagline,
  description: site.description,
  telephone: site.phoneRaw,
  email: site.email,
  areaServed: ["Ernakulam", "Kochi", "Kakkanad", "Kerala"],
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
  openingHours: "Mo-Sa 09:30-18:30",
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
