import {
  KeyRound,
  Smartphone,
  MessageSquareWarning,
  CheckCircle2,
  Users2,
  ArrowRight,
  LayoutDashboard,
  Wallet,
  Building2,
  BarChart3,
  FileText,
  Circle,
} from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";

const steps = [
  { icon: KeyRound, label: "Move in", note: "Onboard to your community in minutes." },
  { icon: Smartphone, label: "Everyday", note: "Dues, services and visitors, in one app." },
  { icon: MessageSquareWarning, label: "Raise", note: "Report an issue in a single tap." },
  { icon: CheckCircle2, label: "Resolve", note: "Tracked to done by trusted vendors." },
  { icon: Users2, label: "Belong", note: "Community, marketplace and insights." },
];

// A simple, intuitive customer journey — horizontal on desktop, stacked on mobile.
export function CustomerJourney() {
  return (
    <div className="rounded-hero border border-hairline bg-surface p-6 shadow-lift md:p-10">
      <Stagger className="grid gap-4 md:grid-cols-5 md:gap-2">
        {steps.map((s, i) => (
          <StaggerItem key={s.label}>
            <div className="relative flex items-start gap-4 md:flex-col md:items-start md:gap-3">
              <div className="flex items-center gap-3 md:w-full md:justify-between">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pine-50 text-pine-600">
                  <s.icon className="h-5 w-5" strokeWidth={1.6} />
                </span>
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden h-4 w-4 text-stone-300 md:block" strokeWidth={1.75} />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="mono text-xs text-clay-600">0{i + 1}</span>
                  <span className="font-display text-lg text-ink">{s.label}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.note}</p>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}

const nav = [
  { icon: LayoutDashboard, label: "Overview", active: true },
  { icon: MessageSquareWarning, label: "Complaints" },
  { icon: Building2, label: "Facilities" },
  { icon: Wallet, label: "Finance" },
  { icon: BarChart3, label: "Analytics" },
  { icon: FileText, label: "Reports" },
];

const kpis = [
  { label: "Collections", value: "94.2%", tone: "pine" },
  { label: "Open complaints", value: "7", tone: "ink" },
  { label: "Avg resolution", value: "1.8d", tone: "ink" },
  { label: "Active vendors", value: "12", tone: "ink" },
];

const bars = [58, 71, 66, 82, 76, 94];
const months = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];

const recent = [
  { unit: "Tower B · 1204", issue: "Water leakage", status: "Resolved", tone: "success" },
  { unit: "Tower A · 0803", issue: "Lift noise", status: "In progress", tone: "warning" },
  { unit: "Villa 12", issue: "Garden lighting", status: "Assigned", tone: "info" },
];

const statusStyles: Record<string, string> = {
  success: "bg-[#e9f2ec] text-[#2f6347]",
  warning: "bg-[#f8f0d9] text-[#9e7817]",
  info: "bg-[#e7eff3] text-[#325870]",
};

// Browser-framed association / admin dashboard — composed on-brand.
export function AdminDashboard() {
  return (
    <div className="overflow-hidden rounded-hero border border-hairline bg-surface shadow-float">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-hairline bg-page px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-stone-300" />
        <span className="h-3 w-3 rounded-full bg-stone-300" />
        <span className="h-3 w-3 rounded-full bg-stone-300" />
        <span className="mx-auto rounded-full bg-surface px-4 py-1 text-xs text-muted">
          app.livingbyitr.com/dashboard
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr] md:grid-cols-[180px_1fr]">
        {/* Sidebar */}
        <aside className="hidden flex-col gap-1 border-r border-hairline bg-page p-3 md:flex">
          <div className="px-2 pb-3 font-display text-xl text-ink">
            Living<span className="text-clay-500">.</span>
          </div>
          {nav.map((n) => (
            <div
              key={n.label}
              className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm ${
                n.active
                  ? "bg-pine-600 text-stone-50"
                  : "text-muted"
              }`}
            >
              <n.icon className="h-4 w-4" strokeWidth={1.6} />
              {n.label}
            </div>
          ))}
        </aside>

        {/* Main */}
        <div className="min-w-0 p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Association overview</p>
              <h3 className="mt-1 font-display text-2xl text-ink">
                Palm Meadows, Kakkanad
              </h3>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-clay-100 text-sm font-medium text-clay-700">
              PM
            </span>
          </div>

          {/* KPI tiles */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-card border border-hairline bg-page p-4">
                <p className="text-xs text-muted">{k.label}</p>
                <p
                  className={`mono mt-1 text-2xl ${
                    k.tone === "pine" ? "text-pine-600" : "text-ink"
                  }`}
                >
                  {k.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            {/* Bar chart */}
            <div className="rounded-card border border-hairline bg-page p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">Complaints resolved</p>
                <p className="text-xs text-muted">last 6 months</p>
              </div>
              <div className="mt-4 flex h-32 items-end gap-2">
                {bars.map((h, i) => (
                  <div key={months[i]} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className={`w-full rounded-t-[5px] ${
                        i === bars.length - 1 ? "bg-clay-500" : "bg-pine-400"
                      }`}
                      style={{ height: `${h}%` }}
                    />
                    <span className="text-[10px] text-muted">{months[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent complaints */}
            <div className="rounded-card border border-hairline bg-page p-4">
              <p className="text-sm font-medium text-ink">Recent complaints</p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {recent.map((r) => (
                  <li key={r.unit} className="flex items-center gap-2.5">
                    <Circle className="h-2 w-2 shrink-0 fill-pine-300 text-pine-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{r.issue}</span>
                      <span className="block truncate text-[11px] text-muted">{r.unit}</span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[r.tone]}`}>
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
