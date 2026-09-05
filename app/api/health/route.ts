import { getCurrentUser } from "@/lib/auth/dal";
import { systemHealth } from "@/lib/health";

// §67. Admin only.
//
// A public health endpoint is a free map of which of Living's dependencies are
// configured and which are currently down — exactly what you would want before
// attacking one. Anonymous callers get a bare liveness answer instead.

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (user?.role !== "admin") {
    // Enough for a load balancer, nothing for anyone else.
    return Response.json({ ok: true });
  }

  const rows = await systemHealth();
  return Response.json(
    { ok: rows.every((row) => row.ok), checks: rows },
    { headers: { "Cache-Control": "no-store" } },
  );
}
