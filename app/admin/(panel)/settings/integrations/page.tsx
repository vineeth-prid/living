import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { systemHealth } from "@/lib/health";
import { Badge, Card, PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Integrations" };

// §1/§3. What Living talks to, and whether any of it is answering.
//
// Admin only, and deliberately so: this is a list of which dependencies exist
// and which are currently down, which is exactly the map you would want before
// attacking one.

export default async function IntegrationsPage() {
  await requireAdmin();

  const health = await systemHealth();

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Connected services and their current state"
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {health.map((row) => (
          <Card key={row.label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="block text-sm font-medium text-stone-900">
                  {row.label}
                </span>
                <span className="mt-1 block text-xs text-stone-500">{row.detail}</span>
              </div>
              <Badge tone={row.ok ? "green" : "red"}>{row.ok ? "OK" : "Down"}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card title="WhatsApp">
        <p className="text-sm text-stone-600">
          Two-way WhatsApp for the CRM: staff run commands from their phones,
          customer enquiries become leads.
        </p>
        <Link
          href="/admin/settings/integrations/whatsapp"
          className="mt-3 inline-block text-sm text-pine-700 hover:underline"
        >
          Manage WhatsApp
        </Link>
      </Card>

      <p className="mt-6 text-xs text-stone-500">
        A service that is not configured reports OK — this application runs
        deliberately without SMTP, object storage, an interpreter or WhatsApp.
        &ldquo;Down&rdquo; means configured and not answering.
      </p>
    </>
  );
}
