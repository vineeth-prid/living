"use server";

import { requireUser } from "@/lib/auth/dal";
import { findDuplicateLeads } from "@/lib/leads";

export type DuplicateLead = {
  id: string;
  reference: string;
  name: string;
  mobile: string;
  status: string;
  createdAt: string;
};

/**
 * §30 — surfaces possible duplicates while a lead is being typed. Never merges
 * anything; the decision stays with the person entering the record.
 *
 * Deliberately ignores the employee visibility scope: an employee needs to know
 * a number already belongs to a colleague's lead, or two people end up calling
 * the same buyer. Only the minimum is returned — no budget, no notes, no email.
 */
export async function checkDuplicates(
  mobile: string,
  email?: string,
): Promise<DuplicateLead[]> {
  await requireUser();
  if (!mobile || mobile.replace(/\D/g, "").length < 6) return [];

  const rows = await findDuplicateLeads(mobile, email || null);
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    name: row.name,
    mobile: row.mobile,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }));
}
