import { requireUser } from "@/lib/auth/dal";
import { IMPORT_COLUMNS } from "@/lib/validation/property-import";
import {
  Badge,
  Card,
  LinkButton,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { importProperties } from "../actions";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import properties" };

export default async function ImportPropertiesPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Import properties"
        subtitle="Everything arrives as a draft. Nothing reaches the website until it's published one by one."
        action={
          <LinkButton href="/admin/properties/import/template" variant="primary">
            Download template
          </LinkButton>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <ImportForm action={importProperties} />

        <Card title="Columns">
          <p className="mb-4 text-sm text-stone-500">
            Six columns are required; leave any of the rest blank and the
            listing is still created, ready to finish in the panel. Photos are
            added per property after importing.
          </p>
          <TableWrap>
            <thead>
              <tr>
                <Th>Column</Th>
                <Th>Required</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_COLUMNS.map((column) => (
                <tr key={column.field}>
                  <Td className="mono whitespace-nowrap text-xs">{column.header}</Td>
                  <Td>
                    {column.required ? (
                      <Badge tone="gold">Required</Badge>
                    ) : (
                      <span className="text-xs text-stone-400">Optional</span>
                    )}
                  </Td>
                  <Td className="text-xs text-stone-500">{column.hint || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      </div>
    </>
  );
}
