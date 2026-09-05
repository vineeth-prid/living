"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChartNoAxesColumn,
  ClipboardList,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptIndianRupee,
  Settings,
  Upload,
  Users,
  UserSquare2,
  X,
} from "lucide-react";
import { cx } from "./ui";

type Item = { href: string; label: string; icon: typeof Users };
type Group = { heading: string; items: Item[] };

export function Sidebar({
  role,
  name,
  logout,
}: {
  role: "admin" | "employee";
  name: string;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // The menu is filtered by role for usability. It is NOT the access control —
  // every page below re-checks the role server-side.
  const groups: Group[] = [
    {
      heading: "Overview",
      items:
        role === "admin"
          ? [
              { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
            ]
          : [
              { href: "/admin/workspace", label: "My Workspace", icon: LayoutDashboard },
            ],
    },
    {
      heading: "Properties",
      items: [
        { href: "/admin/properties", label: "All Properties", icon: Building2 },
        { href: "/admin/properties/new", label: "Add Property", icon: ClipboardList },
        { href: "/admin/properties/import", label: "Import CSV", icon: Upload },
      ],
    },
    {
      heading: "CRM",
      items: [
        { href: "/admin/leads", label: "All Leads", icon: Users },
        { href: "/admin/leads/pipeline", label: "Pipeline", icon: KanbanSquare },
        { href: "/admin/followups", label: "Follow-ups", icon: ClipboardList },
      ],
    },
    ...(role === "admin"
      ? [
          {
            heading: "Administration",
            items: [
              { href: "/admin/expenses", label: "Expenses", icon: ReceiptIndianRupee },
              { href: "/admin/employees", label: "Employees", icon: UserSquare2 },
              { href: "/admin/reports", label: "Reports", icon: ChartNoAxesColumn },
              { href: "/admin/settings", label: "Settings", icon: Settings },
            ],
          },
        ]
      : []),
  ];

  // /admin/properties stays lit on /admin/properties/[id], but must not also
  // light up while a sibling with its own entry is open.
  const SIBLINGS = [
    "/admin/properties/new",
    "/admin/properties/import",
  ];

  const isActive = (href: string) =>
    pathname === href ||
    (!SIBLINGS.includes(href) &&
      !SIBLINGS.includes(pathname) &&
      pathname.startsWith(`${href}/`));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed left-4 top-4 z-40 rounded-[10px] border border-stone-300 bg-white p-2 shadow-soft lg:hidden"
      >
        <Menu className="h-5 w-5 text-stone-700" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-stone-200 bg-white transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <p className="font-display text-xl font-light text-pine-800">Living</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
              {role === "admin" ? "Administrator" : "Employee"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="lg:hidden"
          >
            <X className="h-5 w-5 text-stone-500" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.heading} className="mb-5">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
                {group.heading}
              </p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "mb-0.5 flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm transition",
                    isActive(item.href)
                      ? "bg-pine-50 font-medium text-pine-800"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <form action={logout} className="border-t border-stone-200 p-3">
          <p className="truncate px-2 pb-2 text-xs text-stone-500">{name}</p>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
            Sign out
          </button>
        </form>
      </aside>
    </>
  );
}
