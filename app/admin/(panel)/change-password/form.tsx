"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePassword, type LoginState } from "../../login/actions";
import { Button, ErrorText, Field, inputClass } from "@/components/admin/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Saving…" : "Update password"}
    </Button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    changePassword,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ErrorText>{state.error}</ErrorText>
      <Field label="Current password" required>
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>
      <Field label="New password" required hint="At least 10 characters.">
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <Field label="Confirm new password" required>
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <Submit />
    </form>
  );
}
