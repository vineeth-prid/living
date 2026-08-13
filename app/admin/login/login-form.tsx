"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";
import { Button, ErrorText, Field, inputClass } from "@/components/admin/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ErrorText>{state.error}</ErrorText>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" required>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          className={inputClass}
          placeholder="you@livingbyitr.com"
        />
      </Field>
      <Field label="Password" required>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>
      <Submit />
    </form>
  );
}
