import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  // The admin area must never be indexed, whatever robots.txt says.
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-light text-pine-800">
            Living
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500">
            Property &amp; CRM Admin
          </p>
        </div>
        <div className="rounded-[16px] border border-stone-200 bg-white p-7 shadow-soft">
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-stone-500">
          Internal system. Access is logged.
        </p>
      </div>
    </main>
  );
}
