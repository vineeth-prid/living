"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetEmployeePassword, setEmployeeActive } from "./actions";
import { Button } from "@/components/admin/ui";

export function EmployeeRowActions({
  id,
  isActive,
  isSelf,
}: {
  id: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      {tempPassword && (
        <span className="mono rounded bg-clay-50 px-2 py-1 text-xs text-clay-800">
          {tempPassword}
        </span>
      )}
      <Link
        href={`/admin/employees/${id}`}
        className="text-xs text-stone-500 hover:text-pine-700"
      >
        Edit
      </Link>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            if (!confirm("Reset this password? Their current one stops working.")) return;
            setTempPassword(await resetEmployeePassword(id));
          })
        }
      >
        Reset password
      </Button>
      {/* An admin deactivating themselves would lock themselves out mid-session. */}
      {!isSelf && (
        <Button
          size="sm"
          variant={isActive ? "ghost" : "secondary"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setEmployeeActive(id, !isActive);
            })
          }
        >
          {isActive ? "Deactivate" : "Activate"}
        </Button>
      )}
    </div>
  );
}
