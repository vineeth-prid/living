import type { Metadata } from "next";
import { getProperties } from "@/lib/properties";
import { pageMeta } from "@/lib/site";
import { Listings } from "@/components/property";
import { Section, Pagination } from "@/components/ui";
import {
  PROPERTIES_PER_PAGE,
  currentPage,
  pageSlice,
  totalPages,
} from "@/lib/pagination";
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
export default async function HomesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [properties, params] = await Promise.all([
    getProperties(),
    searchParams,
  ]);

  // The whole collection is read either way — it is one query and a page of a
  // dozen — and cut here. Paging in SQL would mean a second count query for
  // the sake of rows we already have.
  const pages = totalPages(properties.length, PROPERTIES_PER_PAGE);
  const page = currentPage(params.page, pages);
  const shown = pageSlice(properties, page, PROPERTIES_PER_PAGE);

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
      <Section id="listings">
        {properties.length === 0 ? (
          <p className="text-lg text-muted">
            Nothing is listed publicly at the moment. Talk to us — much of what
            we handle never reaches a listing page.
          </p>
        ) : (
          <>
            <Listings items={shown} />
            {/* The anchor lands you back on the grid rather than at the top of
                the page header you already read. */}
            <Pagination
              page={page}
              pages={pages}
              basePath="/homes"
              anchor="#listings"
              label="Homes"
            />
          </>
        )}
      </Section>
      <CtaBand />
    </>
  );
}
