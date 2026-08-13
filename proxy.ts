import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// `proxy.ts`, not `middleware.ts` — the middleware convention is deprecated as
// of Next 16 and renamed to proxy.
//
// This is an OPTIMISTIC check only: it asks whether a session cookie exists, so
// signed-out users bounce to the login page without rendering an admin shell.
// It cannot validate the token — proxy runs on every request including
// prefetches, and hitting Postgres here would put a query on each one. Real
// authentication and every role check live in lib/auth/dal.ts, which runs
// inside the pages and actions themselves. Deleting this file would cost a
// redirect, not a security boundary.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/admin/login") {
    if (hasSession) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const login = new URL("/admin/login", request.url);
    // Bounce back to the page they actually wanted after signing in.
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
