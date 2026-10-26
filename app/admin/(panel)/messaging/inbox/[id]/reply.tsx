"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Send } from "lucide-react";
import { Button, ErrorText, cx, inputClass } from "@/components/admin/ui";
import { replyInThread, setContactAllowed, setOptOutAction } from "../../actions";

// §B10. The reply box, and the two switches that belong next to a conversation
// rather than on a settings page.

export function ReplyBox({
  conversationId,
  disabled,
  disabledReason,
}: {
  conversationId: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, formAction] = useActionState(replyInThread, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box once the message is actually gone — not on submit. A failed
  // send that wiped the text would lose what the person wrote.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="sticky bottom-0 border-t border-stone-200 bg-white/95 p-4 backdrop-blur">
      {state && !state.ok && (
        <div className="mb-2">
          <ErrorText>{state.error}</ErrorText>
        </div>
      )}

      {disabled ? (
        <p className="rounded-[10px] bg-stone-100 px-3 py-2 text-xs text-stone-600">
          {disabledReason ?? "Replies are not possible in this conversation."}
        </p>
      ) : (
        <form ref={formRef} action={formAction} className="flex items-end gap-2">
          <input type="hidden" name="conversationId" value={conversationId} />
          <textarea
            name="text"
            required
            rows={2}
            maxLength={4000}
            placeholder="Write a reply…"
            className={cx(inputClass, "resize-y")}
            onKeyDown={(event) => {
              // Enter sends, shift+Enter makes a new line — what everyone
              // expects from a chat box, and what nobody expects from a form.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <SendButton />
        </form>
      )}
    </div>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mb-[1px]">
      <Send className="h-4 w-4" strokeWidth={1.8} />
      {pending ? "Sending…" : "Send"}
    </Button>
  );
}

/** The nuisance switch and the broadcast opt-out, side by side and distinct. */
export function ContactSwitches({
  contactId,
  phoneNumber,
  isAllowed,
  optedOut,
}: {
  contactId: string;
  phoneNumber: string;
  isAllowed: boolean;
  optedOut: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ ok: boolean } & Record<string, unknown>>) =>
    start(async () => {
      setError(null);
      const result = (await action()) as
        | { ok: true }
        | { ok: false; error: string };
      if (!result.ok) setError(result.error);
    });

  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => setOptOutAction(phoneNumber, !optedOut))}
      >
        {optedOut ? "Allow broadcasts again" : "Stop sending broadcasts"}
      </Button>
      <Button
        size="sm"
        variant={isAllowed ? "danger" : "secondary"}
        disabled={pending}
        onClick={() => run(() => setContactAllowed(contactId, !isAllowed))}
      >
        {isAllowed ? "Silence this number" : "Un-silence this number"}
      </Button>
      <p className="text-[11px] leading-relaxed text-stone-500">
        Silencing stops Living acting on anything from this number at all. The
        opt-out above only stops broadcasts — they can still ask a question and
        get an answer.
      </p>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
