import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { Card, PageHeader } from "@/components/admin/ui";
import { EmployeeForm } from "../employee-form";
import { updateEmployee } from "../actions";

export const metadata = { title: "Edit employee" };

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [employee] = await db()
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      mobile: users.mobile,
      role: users.role,
      department: users.department,
      employeeCode: users.employeeCode,
      permissions: users.permissions,
      joinedAt: users.joinedAt,
      whatsappEnabled: users.whatsappEnabled,
      whatsappCrmEnabled: users.whatsappCrmEnabled,
      whatsappNumber: users.whatsappNumber,
      whatsappLastSeenAt: users.whatsappLastSeenAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!employee) notFound();

  const activity = await db()
    .select({
      action: auditLogs.action,
      entity: auditLogs.entity,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(eq(auditLogs.actorId, id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(15);

  // Bind the id server-side. If it came from a hidden form field, an admin
  // could retarget the update by editing the DOM.
  const action = updateEmployee.bind(null, id);

  return (
    <>
      <PageHeader title={employee.fullName} subtitle={employee.email} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <EmployeeForm
            action={action}
            submitLabel="Save changes"
            initial={{
              fullName: employee.fullName,
              email: employee.email,
              mobile: employee.mobile ?? "",
              role: employee.role,
              department: employee.department ?? "",
              employeeCode: employee.employeeCode ?? "",
              joinedAt: iso(employee.joinedAt),
              permissions: employee.permissions,
            }}
          />
        </div>

        <Card title="Recent activity">
          {activity.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {activity.map((entry, i) => (
                <li key={i} className="text-xs">
                  <span className="block text-stone-800">{entry.action}</span>
                  <span className="text-stone-400">
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
