import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import {
  employeeOptions,
  pipelineLeads,
  PIPELINE_COLUMN_LIMIT,
} from "@/lib/leads.admin";
import { LinkButton, PageHeader, cx, inputClass } from "@/components/admin/ui";
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

      <form method="get" className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-stone-200 bg-white p-3">
        {user.role === "admin" && (
          <select name="assignedToId" defaultValue={sp.assignedToId ?? ""} className={cx(inputClass, "w-auto")}>
            <option value="">Everyone</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.fullName}</option>
            ))}
          </select>
        )}
        <select name="priority" defaultValue={sp.priority ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Any priority</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-stone-600">
          <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="h-4 w-4 accent-[var(--color-pine-600)]" />
          Only mine
        </label>
        <button type="submit" className="rounded-[10px] bg-pine-600 px-4 py-2 text-sm font-medium text-white hover:bg-pine-700">
          Apply
        </button>
        <Link href="/admin/leads/pipeline" className="text-sm text-stone-500 hover:text-stone-800">
          Clear
        </Link>
      </form>

      <PipelineBoard
        cards={cards}
        totals={totals}
        columnLimit={PIPELINE_COLUMN_LIMIT}
      />
    </>
  );
}
