import type { Metadata } from "next";
import Link from "next/link";
import { getProperties } from "@/lib/properties";
import { BUDGETS, filterProperties, locationsOf } from "@/lib/property-filters";
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

  const budget = typeof params.budget === "string" ? params.budget : "";
  const location = typeof params.location === "string" ? params.location : "";
  const filtered = filterProperties(properties, budget, location);
  const query = new URLSearchParams(
    Object.entries({ budget, location }).filter(([, v]) => v),
  ).toString();

  // The whole collection is read either way — it is one query and a page of a
  // dozen — and cut here. Paging in SQL would mean a second count query for
  // the sake of rows we already have.
  const pages = totalPages(filtered.length, PROPERTIES_PER_PAGE);
  const page = currentPage(params.page, pages);
  const shown = pageSlice(filtered, page, PROPERTIES_PER_PAGE);
  const field =
    "mt-2 w-full rounded-[12px] border border-stone-300 bg-page px-4 py-3 text-ink outline-none transition focus:border-pine-500 focus:ring-[3px] focus:ring-pine-500/25";

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
            {/* A plain GET form: works without JavaScript, and the result is a
                URL. Leaving `page` out means a new filter starts on page one. */}
            <form
              action="/homes#listings"
              className="mb-10 grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]"
            >
              <label className="text-sm font-medium text-ink">
                Budget
                <select name="budget" defaultValue={budget} className={field}>
                  <option value="">Any budget</option>
                  {BUDGETS.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-ink">
                Location
                <select name="location" defaultValue={location} className={field}>
                  <option value="">Any location</option>
                  {locationsOf(properties).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  className="rounded-[12px] bg-pine-700 px-6 py-3 text-ui font-medium text-stone-50 transition hover:bg-pine-800"
                >
                  Show homes
                </button>
                {query && (
                  <Link href="/homes#listings" className="text-ui text-pine-700 hover:text-pine-800">
                    Clear
                  </Link>
                )}
              </div>
            </form>
            {filtered.length === 0 ? (
              <p className="text-lg text-muted">
                Nothing matches that budget and location right now. Try widening
                the search, or talk to us — much of what we handle never reaches
                a listing page.
              </p>
            ) : (
              <Listings items={shown} />
            )}
            {/* The anchor lands you back on the grid rather than at the top of
                the page header you already read. */}
            <Pagination
              page={page}
              pages={pages}
              basePath={query ? `/homes?${query}` : "/homes"}
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
