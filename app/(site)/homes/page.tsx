import type { Metadata } from "next";
import { getProperties } from "@/lib/properties";
import { pageMeta } from "@/lib/site";
import { Listings } from "@/components/property";
import { Section } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { CtaBand } from "@/components/cta";
import { JsonLd, breadcrumb } from "@/components/schema";
import { img } from "@/lib/images";

export const metadata: Metadata = pageMeta(
  "Homes for sale in Kochi & Ernakulam",
  "Curated residences across Kochi and Ernakulam — apartments, villas and garden homes, each one visited and verified by the Living team.",
  "/homes",
);

// The breadcrumb on each property page points here, and the sitemap lists it.
export default async function HomesPage() {
  const properties = await getProperties();

  return (
    <>
      <JsonLd
        data={breadcrumb([
          { name: "Home", path: "/" },
          { name: "Homes", path: "/homes" },
        ])}
      />
      <PageHeader
        eyebrow="Current collection"
        title={<>Homes we&apos;d live in ourselves.</>}
        intro="Every listing here has been visited, verified and documented by our team. What you see is what you get — including the parts most listings leave out."
        image={img.heroArch}
        imageAlt="A Living residence in Kochi"
      />
      <Section>
        {properties.length === 0 ? (
          <p className="text-lg text-muted">
            Nothing is listed publicly at the moment. Talk to us — much of what
            we handle never reaches a listing page.
          </p>
        ) : (
          <Listings items={properties} />
        )}
      </Section>
      <CtaBand />
    </>
  );
}
