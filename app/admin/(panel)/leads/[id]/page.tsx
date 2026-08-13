import { notFound } from "next/navigation";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import {
  employeeOptions,
  getLead,
  propertyPickerOptions,
} from "@/lib/leads.admin";
import { Card, PageHeader, cx } from "@/components/admin/ui";
import {
  PriorityTag,
  StatusBadge,
  budgetRange,
  dateTime,
  relativeDue,
} from "@/components/admin/crm";
import {
  FollowUpPanel,
  InteractionLogger,
  LeadControls,
  LinkedProperties,
  NoteComposer,
} from "./workspace-widgets";

export const metadata = { title: "Lead" };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // getLead applies the visibility scope in its WHERE clause. An employee
  // opening a colleague's lead id gets a 404, not someone else's data.
  const lead = await getLead(user, id);
  if (!lead) notFound();

  const isAdmin = user.role === "admin";
  const [employees, propertyOptions] = await Promise.all([
    isAdmin ? employeeOptions() : Promise.resolve([]),
    propertyPickerOptions(),
  ]);

  const due = relativeDue(lead.nextFollowUpAt);
  const whatsapp = `https://wa.me/${lead.mobile.replace(/\D/g, "")}`;

  return (
    <>
      <PageHeader
        title={lead.name}
        subtitle={`${lead.reference} · created ${dateTime(lead.createdAt)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={lead.status} />
            <PriorityTag priority={lead.priority} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        {/* Main workspace — everything an employee needs without navigating. */}
        <div className="flex flex-col gap-6">
          <Card title="Contact">
            <div className="flex flex-wrap gap-2">
              <a
                href={`tel:${lead.mobile}`}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-pine-600 px-3 py-2 text-sm font-medium text-white hover:bg-pine-700"
              >
                <Phone className="h-4 w-4" /> {lead.mobile}
              </a>
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50"
                >
                  <Mail className="h-4 w-4" /> {lead.email}
                </a>
              )}
            </div>

            <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Row label="Alternate mobile" value={lead.altMobile} />
              <Row label="Preferred contact" value={lead.preferredContact} />
              <Row label="City" value={lead.city} />
              <Row label="Location" value={lead.location} />
              <Row label="Country" value={lead.country} />
              <Row label="Last contacted" value={lead.lastContactedAt ? dateTime(lead.lastContactedAt) : null} />
            </dl>
          </Card>

          <Card title="Requirement">
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <Row label="Looking to" value={lead.requirementType} />
              <Row label="Property type" value={lead.propertyKind} />
              <Row label="Budget" value={budgetRange(lead.budgetMin, lead.budgetMax)} />
              <Row label="Preferred location" value={lead.preferredLocation} />
              <Row label="Preferred property" value={lead.preferredPropertyType} />
              <Row label="Bedrooms" value={lead.bedrooms ? String(lead.bedrooms) : null} />
              <Row label="Land requirement" value={lead.landRequirement} />
              <Row label="Timeline" value={lead.timeline} />
              <Row label="Purpose" value={lead.purpose} />
            </dl>
          </Card>

          <LinkedProperties
            id={lead.id}
            linked={lead.properties}
            options={propertyOptions}
          />

          <Card title="Log activity">
            <InteractionLogger id={lead.id} />
          </Card>

          <Card title={`Notes (${lead.notes.length})`}>
            <NoteComposer id={lead.id} />
            {lead.notes.length > 0 && (
              <ul className="mt-5 flex flex-col gap-4 border-t border-stone-200 pt-5">
                {lead.notes.map((note) => (
                  <li key={note.id}>
                    <p className="whitespace-pre-line text-sm text-stone-800">
                      {note.body}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">
                      {note.authorName ?? "Website"} · {dateTime(note.createdAt)}
                      {note.kind === "initial" && " · initial enquiry"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* §25 — the audit trail. Append-only; nothing here is ever removed. */}
          <Card title="Activity timeline">
            {lead.activities.length === 0 ? (
              <p className="text-sm text-stone-500">Nothing recorded yet.</p>
            ) : (
              <ol className="relative flex flex-col gap-4 border-l border-stone-200 pl-5">
                {lead.activities.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-pine-500" />
                    <p className="text-sm text-stone-800">{entry.summary}</p>
                    <p className="text-xs text-stone-400">
                      {entry.actorName ?? "System"} · {dateTime(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card title="Next follow-up">
            {lead.nextFollowUpAt ? (
              <p className={cx("text-sm", due.overdue ? "text-[var(--color-danger)]" : "text-stone-800")}>
                {dateTime(lead.nextFollowUpAt)}
                <span className="mt-0.5 block text-xs">{due.label}</span>
              </p>
            ) : (
              <p className="text-sm text-stone-500">Nothing scheduled.</p>
            )}
          </Card>

          <LeadControls
            id={lead.id}
            status={lead.status}
            priority={lead.priority}
            assignedToId={lead.assignedToId}
            employees={employees}
            isAdmin={isAdmin}
          />

          <FollowUpPanel
            id={lead.id}
            followups={lead.followups}
            employees={employees}
            isAdmin={isAdmin}
          />

          <Card title="Source">
            <dl className="grid gap-3 text-sm">
              <Row label="Source" value={lead.sourceKey} />
              <Row label="Campaign" value={lead.campaign} />
              <Row label="UTM source" value={lead.utmSource} />
              <Row label="UTM medium" value={lead.utmMedium} />
              <Row label="UTM campaign" value={lead.utmCampaign} />
              <Row label="Landing page" value={lead.landingPage} />
              <Row label="Referrer" value={lead.referrerUrl} />
              <Row label="Assigned to" value={lead.assignedToName} />
            </dl>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-stone-400">{label}</dt>
      <dd className="mt-0.5 break-words capitalize text-stone-800">
        {value ? value.replace(/_/g, " ") : "—"}
      </dd>
    </div>
  );
}
