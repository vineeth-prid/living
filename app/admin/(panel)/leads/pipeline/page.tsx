import { requireUser } from "@/lib/auth/dal";
import {
  employeeOptions,
  pipelineLeads,
  PIPELINE_COLUMN_LIMIT,
} from "@/lib/leads.admin";
import {
  FilterBar,
  LinkButton,
  PageHeader,
  filterClass,
} from "@/components/admin/ui";
import { PipelineBoard } from "./board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const [{ cards, totals }, employees] = await Promise.all([
    pipelineLeads(user, {
      assignedToId: sp.assignedToId,
      priority: sp.priority,
      mine: sp.mine === "1",
    }),
    user.role === "admin" ? employeeOptions() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle={`${cards.length} lead${cards.length === 1 ? "" : "s"} on the board`}
        action={<LinkButton href="/admin/leads">List view</LinkButton>}
      />

      <FilterBar clearHref="/admin/leads/pipeline">
        {user.role === "admin" && (
          <select name="assignedToId" defaultValue={sp.assignedToId ?? ""} className={filterClass}>
            <option value="">Everyone</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}</option>
            ))}
          </select>
        )}
        <select name="priority" defaultValue={sp.priority ?? ""} className={filterClass}>
          <option value="">Any priority</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-stone-500">
          <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="h-4 w-4 accent-[var(--color-pine-600)]" />
          Only mine
        </label>
      </FilterBar>

      <PipelineBoard
        cards={cards}
        totals={totals}
        columnLimit={PIPELINE_COLUMN_LIMIT}
      />
    </>
  );
}
