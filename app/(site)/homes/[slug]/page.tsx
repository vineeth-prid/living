import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { BedDouble, Bath, Maximize, MapPin, Check } from "lucide-react";
import { getProperty, getPropertySlugs } from "@/lib/properties";
import { site, pageMeta } from "@/lib/site";
import { JsonLd, breadcrumb } from "@/components/schema";
import { Eyebrow, Section } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { CtaBand } from "@/components/cta";
import { PropertyEnquiryForm } from "@/components/property-enquiry";

// Only published listings ever resolve here — getProperty() filters on
// workflowStatus = published AND isPublic, so a draft URL 404s (Rule 2).
export async function generateStaticParams() {
  const slugs = await getPropertySlugs();
  return slugs.map(({ id }) => ({ slug: id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const property = await getProperty(slug);
  if (!property) return { title: "Property not found" };

  // Falls back through the public fields only. finalPrice and internal notes
  // aren't in the projection at all, so they can't reach metadata by accident.
  const title =
    property.seoTitle ?? `${property.name} — ${property.type} in ${property.locality}`;
  const description =
    property.seoDescription ?? property.summary.slice(0, 200);

  return {
    ...pageMeta(title, description, `/homes/${property.id}`),
    openGraph: {
      title: `${title} · ${site.name}`,
      description,
      url: `/homes/${property.id}`,
      type: "article",
      images: property.gallery[0] ? [{ url: property.gallery[0] }] : undefined,
    },
  };
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getProperty(slug);
  if (!property) notFound();

  const hero = property.gallery[0];
  const rest = property.gallery.slice(1, 5);

  const schema = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: property.name,
    description: property.summary,
    url: `${site.url}/homes/${property.id}`,
    image: property.gallery.slice(0, 4),
    datePosted: property.updatedAt.toISOString(),
    // Locality and city only — the street address is internal unless the
    // listing explicitly opts in, and the public projection never carries it.
    address: {
      "@type": "PostalAddress",
      addressLocality: property.locality,
      addressRegion: property.city,
      addressCountry: "IN",
    },
    offers: {
      "@type": "Offer",
      price: property.priceValue,
      priceCurrency: "INR",
      availability:
        property.status === "Ready to move"
          ? "https://schema.org/InStock"
          : "https://schema.org/PreOrder",
    },
    numberOfBedrooms: property.beds || undefined,
    numberOfBathroomsTotal: property.baths || undefined,
    provider: { "@id": `${site.url}/#organization` },
  };

  return (
    <>
      <JsonLd data={schema} />
      <JsonLd
        data={breadcrumb([
          { name: "Home", path: "/" },
          { name: "Homes", path: "/homes" },
          { name: property.name, path: `/homes/${property.id}` },
        ])}
      />

      <article>
        {hero && (
          <div className="relative h-[58vh] min-h-[26rem] w-full overflow-hidden scrim-b">
            <Image
              src={hero}
              alt={`${property.name} — ${property.type} in ${property.locality}, ${property.city}`}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="shell absolute inset-x-0 bottom-0 z-10 pb-10">
              <span className="inline-flex rounded-full bg-stone-50/90 px-3 py-1 text-xs font-medium text-pine-800 backdrop-blur">
                {property.status}
              </span>
              <h1 className="display-lg mt-3 font-display font-light text-stone-50">
                {property.name}
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-stone-100">
                <MapPin className="h-4 w-4" strokeWidth={1.6} />
                {property.locality}, {property.city}
              </p>
            </div>
          </div>
        )}

        <Section>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div>
              <Reveal>
                <Eyebrow>{property.type}</Eyebrow>
                <p className="mt-4 font-display text-3xl font-light text-ink">
                  {property.priceLabel}
                </p>
                <p className="mt-5 max-w-2xl text-lg leading-relaxed text-body">
                  {property.summary}
                </p>
                {property.description && (
                  <div className="mt-6 max-w-2xl whitespace-pre-line leading-relaxed text-body">
                    {property.description}
                  </div>
                )}
              </Reveal>

              <div className="mt-10 flex flex-wrap gap-8 border-y border-hairline py-6">
                {property.beds > 0 && (
                  <Stat icon={BedDouble} label="Bedrooms" value={String(property.beds)} />
                )}
                {property.baths > 0 && (
                  <Stat icon={Bath} label="Bathrooms" value={String(property.baths)} />
                )}
                {property.area && (
                  <Stat icon={Maximize} label="Area" value={property.area} />
                )}
              </div>

              {property.details.length > 0 && (
                <dl className="mt-10 grid gap-x-10 gap-y-4 sm:grid-cols-2">
                  {property.details.map((d) => (
                    <div key={d.label} className="flex justify-between gap-4 border-b border-hairline pb-3">
                      <dt className="text-sm text-muted">{d.label}</dt>
                      <dd className="text-sm font-medium text-ink">{d.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {property.amenities.length > 0 && (
                <div className="mt-12">
                  <Eyebrow>Amenities</Eyebrow>
                  <Stagger className="mt-5 grid gap-3 sm:grid-cols-2">
                    {property.amenities.map((a) => (
                      <StaggerItem key={a}>
                        <p className="flex items-center gap-2.5 text-body">
                          <Check className="h-4 w-4 shrink-0 text-pine-600" strokeWidth={2} />
                          {a}
                        </p>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </div>
              )}

              {rest.length > 0 && (
                <div className="mt-14 grid gap-4 sm:grid-cols-2">
                  {rest.map((src, i) => (
                    <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-media">
                      <Image
                        src={src}
                        alt={`${property.name} — view ${i + 2}`}
                        fill
                        sizes="(max-width: 640px) 100vw, 50vw"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* §32 — the enquiry that becomes a CRM lead attached to this listing. */}
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <PropertyEnquiryForm
                propertyId={property.id}
                propertyName={property.name}
                propertyReference={property.reference}
              />
              <p className="mt-4 text-center text-xs text-muted">
                Or call{" "}
                <Link href={`tel:${site.phoneRaw}`} className="text-pine-700 underline underline-offset-4">
                  {site.phone}
                </Link>
              </p>
            </aside>
          </div>
        </Section>
      </article>

      <CtaBand />
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BedDouble;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-pine-600" strokeWidth={1.6} />
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
        <p className="font-medium text-ink">{value}</p>
      </div>
    </div>
  );
}
