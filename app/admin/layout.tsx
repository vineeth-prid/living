import type { Metadata } from "next";

// Wraps every /admin route, including the login page, so nothing under this
// path is ever indexed. Auth is NOT enforced here: a layout doesn't control
// whether its child segments render, and it doesn't re-run on client-side
// navigation. Enforcement lives in the DAL, called by each page.
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Living Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
