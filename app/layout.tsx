import type { Metadata } from "next";
import { Cormorant, Schibsted_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { site } from "@/lib/site";

// Document shell only: fonts, <html>/<body> and the site-wide metadata
// defaults. The marketing nav, footer and organisation schema belong to the
// public site and live in app/(site)/layout.tsx, so the admin panel doesn't
// inherit them.

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-IN"
      className={`${cormorant.variable} ${schibsted.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
