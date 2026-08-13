import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import {
  listProperties,
  propertyCities,
  type PropertyFilters,
} from "@/lib/properties.admin";
import { WORKFLOW_STATUSES } from "@/lib/db/schema";
import {
  Badge,
  EmptyState,
  LinkButton,
  PageHeader,
  TableWrap,
  Td,
  Th,
  cx,
  inputClass,
} from "@/components/admin/ui";
import { PropertyRowActions } from "./row-actions";

export const metadata = { title: "Properties" };

const STATUS_TONE: Record<string, "green" | "gold" | "neutral" | "red" | "blue"> = {
  published: "green",
  draft: "neutral",
  ready_for_review: "blue",
  reserved: "gold",
  sold: "gold",
  rented: "gold",
  off_market: "neutral",
  archived: "red",
};

const label = (s: string) => s.replace(/_/g, " ");

const money = (n: number | null) =>
  n ? `₹${n.toLocaleString("en-IN")}` : "—";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const filters: PropertyFilters = {
    q: sp.q,
    status: (sp.status as PropertyFilters["status"]) ?? "all",
    kind: sp.kind,
    listingType: sp.listingType,
    city: sp.city,
    sort: (sp.sort as PropertyFilters["sort"]) ?? "recent",
    page: sp.page ? Number(sp.page) : 1,
  };

  const [{ rows, total, page, pages }, cities] = await Promise.all([
    listProperties(filters),
    propertyCities(),
  ]);

  const pageHref = (n: number) => {
    const params = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v) as [string, string][],
    );
    params.set("page", String(n));
    return `/admin/properties?${params}`;
  };

  return (
    <>
      <PageHeader
        title="Properties"
        subtitle={`${total} listing${total === 1 ? "" : "s"}`}
        action={
          <LinkButton href="/admin/properties/new" variant="primary">
            Add property
          </LinkButton>
        }
      />

      {/* A GET form: filters live in the URL, so a filtered view is
          shareable and the back button behaves. */}
      <form
        method="get"
        className="mb-5 flex flex-wrap items-end gap-3 rounded-[14px] border border-stone-200 bg-white p-4"
      >
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search title, reference, locality…"
          className={cx(inputClass, "w-full sm:w-72")}
        />
        <select name="status" defaultValue={filters.status} className={cx(inputClass, "w-auto")}>
          <option value="all">Any status</option>
          {WORKFLOW_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {label(s)}
            </option>
          ))}
        </select>
        <select name="kind" defaultValue={sp.kind ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Any type</option>
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
        </select>
        <select name="listingType" defaultValue={sp.listingType ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Sale or rental</option>
          <option value="sale">Sale</option>
          <option value="rental">Rental</option>
          <option value="both">Both</option>
        </select>
        <select name="city" defaultValue={sp.city ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Any city</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select name="sort" defaultValue={filters.sort} className={cx(inputClass, "w-auto")}>
          <option value="recent">Newest</option>
          <option value="updated">Recently updated</option>
          <option value="price_desc">Price, high to low</option>
          <option value="price_asc">Price, low to high</option>
        </select>
        <button
          type="submit"
          className="rounded-[10px] bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700"
        >
          Apply
        </button>
        <Link href="/admin/properties" className="text-sm text-stone-500 hover:text-stone-800">
          Clear
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No properties match"
          hint="Adjust the filters, or add the first listing."
          action={<LinkButton href="/admin/properties/new" variant="primary">Add property</LinkButton>}
        />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Property</Th>
                <Th>Location</Th>
                <Th>Type</Th>
                <Th>Asking price</Th>
                <Th>Status</Th>
                <Th>Live</Th>
                <Th>Created by</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-stone-50">
                  <Td className="mono text-xs text-stone-500">{row.reference ?? "—"}</Td>
                  <Td>
                    <Link
                      href={`/admin/properties/${row.id}`}
                      className="font-medium text-stone-900 hover:text-pine-700"
                    >
                      {row.name}
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {row.locality}
                    <span className="block text-stone-400">{row.city}</span>
                  </Td>
                  <Td className="text-xs capitalize">
                    {row.kind}
                    <span className="block text-stone-400 capitalize">{row.listingType}</span>
                  </Td>
                  <Td className="mono text-xs">{money(row.askingPrice)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[row.workflowStatus] ?? "neutral"}>
                      <span className="capitalize">{label(row.workflowStatus)}</span>
                    </Badge>
                  </Td>
                  <Td>
                    {row.isPublic ? (
                      <Badge tone="green">On site</Badge>
                    ) : (
                      <span className="text-xs text-stone-400">Hidden</span>
                    )}
                  </Td>
                  <Td className="text-xs">{row.createdByName ?? "—"}</Td>
                  <Td className="text-xs text-stone-500">
                    {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(row.updatedAt)}
                  </Td>
                  <Td className="text-right">
                    <PropertyRowActions
                      id={row.id}
                      isPublic={row.isPublic}
                      canPublish={user.role === "admin" || user.permissions.includes("property.publish")}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>

          {pages > 1 && (
            <nav className="mt-4 flex items-center justify-center gap-2 text-sm">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="rounded px-3 py-1.5 hover:bg-stone-200">
                  Previous
                </Link>
              )}
              <span className="text-stone-500">
                Page {page} of {pages}
              </span>
              {page < pages && (
                <Link href={pageHref(page + 1)} className="rounded px-3 py-1.5 hover:bg-stone-200">
                  Next
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
