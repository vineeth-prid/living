import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  Badge,
  EmptyState,
  LinkButton,
  PageHeader,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { EmployeeRowActions } from "./row-actions";

export const metadata = { title: "Employees" };

const fmt = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(d)
    : "—";

export default async function EmployeesPage() {
  // Server-side gate. An employee reaching this URL never sees the query run.
  const admin = await requireAdmin();

  // Explicit column list — passwordHash must never leave the database layer,
  // and `select()` with no argument would carry it into the RSC payload.
  const rows = await db()
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      mobile: users.mobile,
      role: users.role,
      department: users.department,
      employeeCode: users.employeeCode,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      joinedAt: users.joinedAt,
    })
    .from(users)
    .orderBy(desc(users.isActive), users.fullName);

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={`${rows.length} account${rows.length === 1 ? "" : "s"}`}
        action={<LinkButton href="/admin/employees/new" variant="primary">Add employee</LinkButton>}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No employees yet"
          hint="Add your first team member to give them access to the CRM."
          action={<LinkButton href="/admin/employees/new" variant="primary">Add employee</LinkButton>}
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th>Contact</Th>
              <Th>Role</Th>
              <Th>Department</Th>
              <Th>Joined</Th>
              <Th>Last login</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-stone-50">
                <Td>
                  <a
                    href={`/admin/employees/${row.id}`}
                    className="font-medium text-stone-900 hover:text-pine-700"
                  >
                    {row.fullName}
                  </a>
                  {row.employeeCode && (
                    <span className="mono ml-2 text-xs text-stone-400">
                      {row.employeeCode}
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="block text-xs text-stone-600">{row.email}</span>
                  <span className="block text-xs text-stone-400">
                    {row.mobile ?? "—"}
                  </span>
                </Td>
                <Td>
                  <Badge tone={row.role === "admin" ? "gold" : "neutral"}>
                    {row.role === "admin" ? "Administrator" : "Employee"}
                  </Badge>
                </Td>
                <Td className="text-xs">{row.department ?? "—"}</Td>
                <Td className="text-xs">{fmt(row.joinedAt)}</Td>
                <Td className="text-xs">{fmt(row.lastLoginAt)}</Td>
                <Td>
                  <Badge tone={row.isActive ? "green" : "red"}>
                    {row.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td className="text-right">
                  <EmployeeRowActions
                    id={row.id}
                    isActive={row.isActive}
                    isSelf={row.id === admin.id}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
