"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Paperclip, Search, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Field,
  cx,
  inputClass,
} from "@/components/admin/ui";
import { LEAD_STATUS_LABELS } from "@/components/admin/crm";
import type { Candidate } from "@/lib/crm/whatsapp/audience";
import {
  createBroadcastAction,
  previewAudience,
  previewPicked,
  searchLeads,
  type Preview,
} from "./actions";

// §B9. The composer.
//
// The shape of this screen is the safety feature. Media, then the words, then
// who it goes to, then a count that has to be fetched before the button
// unlocks — in that order, because the count is the only thing that makes a
// filter mistake visible, and a Send button that works without one is a
// Send button that sends to everybody.

type Option = { value: string; label: string };

export type PresetOption = {
  key: string;
  label: string;
  help: string;
};

export function Composer({
  presets,
  employees,
  sources,
  cities,
  configured,
  storageReady,
  today,
  tomorrow,
}: {
  presets: PresetOption[];
  employees: Option[];
  sources: Option[];
  cities: string[];
  configured: boolean;
  storageReady: boolean;
  /**
   * Today and tomorrow in Kochi, as "YYYY-MM-DD", rendered on the server.
   *
   * Passed in rather than read from the browser clock. The time is interpreted
   * in Kochi whatever zone the operator is in, so a laptop in Dubai offering
   * its own "today" as the earliest date would be offering the wrong one — and
   * reading a clock during render is not something a component may do anyway.
   */
  today: string;
  tomorrow: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(createBroadcastAction, null);

  const [mode, setMode] = useState<"filter" | "picked">("filter");
  const [preset, setPreset] = useState(presets[0]?.key ?? "all");
  const [picked, setPicked] = useState<Candidate[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const [file, setFile] = useState<File | null>(null);

  // A preview of the actual file, so the thing attached is the thing seen.
  //
  // Derived rather than held in state: the URL is a pure function of the file,
  // and the effect below exists only to revoke it. A few hundred of these in
  // one session is a real leak, and this form gets used in exactly that bursty
  // way — pick a photo, look at it, pick a better one.
  const objectUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  // Any change to the audience invalidates the count. Leaving a stale number
  // on screen is worse than having none: it is the number the operator would
  // check before sending to a different list.
  const invalidate = () => {
    setPreview(null);
    setPreviewError(null);
  };

  const check = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);

    startChecking(async () => {
      setPreviewError(null);
      const result =
        mode === "picked"
          ? await previewPicked(picked.map((candidate) => candidate.leadId))
          : await previewAudience(preset as never, {
              status: str(data.get("status")),
              priority: str(data.get("priority")),
              assignedToId: str(data.get("assignedToId")),
              sourceKey: str(data.get("sourceKey")),
              city: str(data.get("city")),
              createdFrom: str(data.get("createdFrom")),
              createdTo: str(data.get("createdTo")),
            });

      if (result.ok) setPreview(result.data);
      else setPreviewError(result.error);
    });
  };

  // On success the report page is where the send happens, so go there.
  useEffect(() => {
    if (state?.ok) router.push(`/admin/messaging/${state.data.id}`);
  }, [state, router]);

  const ready = Boolean(preview && preview.summary.sendable > 0);

  return (
    <Card title="New broadcast">
      {!configured && (
        <p className="mb-4 rounded-[10px] bg-clay-50 px-3 py-2 text-xs text-clay-800">
          WhatsApp is not configured, so nothing can be sent yet. The OPENWA_*
          variables go in .env.local.
        </p>
      )}

      <form ref={formRef} action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="mode" value={mode} />
        {mode === "picked" &&
          picked.map((candidate) => (
            <input
              key={candidate.leadId}
              type="hidden"
              name="leadIds"
              value={candidate.leadId}
            />
          ))}

        {state && !state.ok && <ErrorText>{state.error}</ErrorText>}

        {/* 1 — the media */}
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <MediaPicker
            file={file}
            objectUrl={objectUrl}
            onPick={setFile}
            disabled={!storageReady}
          />
          <div className="flex flex-col gap-3">
            <Field label="Name" required hint="Internal only — never sent.">
              <input
                name="name"
                required
                maxLength={120}
                placeholder="Diwali offer — Kakkanad"
                className={inputClass}
              />
            </Field>
            <Field
              label="Message"
              required
              hint="Sent as the caption under the attachment. Plain text; *bold* works."
            >
              <textarea
                name="body"
                required
                rows={5}
                maxLength={4000}
                placeholder="Write what they will read…"
                className={cx(inputClass, "resize-y")}
              />
            </Field>
          </div>
        </div>

        {!storageReady && (
          <p className="text-xs text-stone-500">
            MinIO is not configured, so a broadcast can carry text only.
          </p>
        )}

        {/* 2 — the audience */}
        <div className="rounded-[12px] border border-stone-200 bg-stone-50/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ModeTab active={mode === "filter"} onClick={() => { setMode("filter"); invalidate(); }}>
              Choose a group
            </ModeTab>
            <ModeTab active={mode === "picked"} onClick={() => { setMode("picked"); invalidate(); }}>
              Pick people{picked.length > 0 && ` (${picked.length})`}
            </ModeTab>
          </div>

          {mode === "filter" ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {presets.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    title={option.help}
                    onClick={() => {
                      setPreset(option.key);
                      invalidate();
                    }}
                    className={cx(
                      "rounded-full border px-3 py-1 text-xs font-medium transition",
                      preset === option.key
                        ? "border-pine-600 bg-pine-600 text-white"
                        : "border-stone-300 bg-white text-stone-600 hover:border-stone-400",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mb-3 text-xs text-stone-500">
                {presets.find((option) => option.key === preset)?.help}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Status">
                  <select name="status" onChange={invalidate} className={inputClass}>
                    <option value="">Any — or whatever the group sets</option>
                    {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Priority">
                  <select name="priority" onChange={invalidate} className={inputClass}>
                    <option value="">Any</option>
                    <option value="hot">Hot</option>
                    <option value="warm">Warm</option>
                    <option value="cold">Cold</option>
                  </select>
                </Field>
                <Field label="Assigned to">
                  <select name="assignedToId" onChange={invalidate} className={inputClass}>
                    <option value="">Anyone</option>
                    {employees.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Source">
                  <select name="sourceKey" onChange={invalidate} className={inputClass}>
                    <option value="">Any</option>
                    {sources.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="City">
                  <input
                    name="city"
                    list="broadcast-cities"
                    onChange={invalidate}
                    placeholder="Any"
                    className={inputClass}
                  />
                  <datalist id="broadcast-cities">
                    {cities.map((city) => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Added after">
                  <input
                    type="date"
                    name="createdFrom"
                    onChange={invalidate}
                    className={inputClass}
                  />
                </Field>
                <Field label="Added before">
                  <input
                    type="date"
                    name="createdTo"
                    onChange={invalidate}
                    className={inputClass}
                  />
                </Field>
              </div>
            </>
          ) : (
            <LeadPicker
              picked={picked}
              onChange={(next) => {
                setPicked(next);
                invalidate();
              }}
            />
          )}
        </div>

        {/* 3 — when */}
        <SchedulePicker today={today} tomorrow={tomorrow} />

        {/* 4 — the count, and only then the button */}
        <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={check}
            disabled={checking || (mode === "picked" && picked.length === 0)}
          >
            {checking ? "Counting…" : "Check who this reaches"}
          </Button>

          {preview && <PreviewLine preview={preview} />}
          {previewError && <ErrorText>{previewError}</ErrorText>}

          <div className="ml-auto">
            <SubmitButton ready={ready && configured} count={preview?.summary.sendable ?? 0} />
          </div>
        </div>

        {!preview && (
          <p className="-mt-2 text-xs text-stone-500">
            Check the audience first. The count is the only thing that catches a
            filter mistake before several hundred people get the message.
          </p>
        )}

        {preview && preview.sample.length > 0 && (
          <details className="rounded-[10px] border border-stone-200 p-3">
            <summary className="cursor-pointer text-xs text-stone-500 hover:text-stone-800">
              Show the first {preview.sample.length}
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-xs">
              {preview.sample.map((candidate) => (
                <li
                  key={candidate.leadId}
                  className="flex items-center justify-between gap-3"
                >
                  <span className={candidate.excluded ? "text-stone-400 line-through" : "text-stone-700"}>
                    {candidate.name} · {candidate.reference}
                  </span>
                  {candidate.excluded && (
                    <Badge tone="neutral">{candidate.excluded}</Badge>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </form>
    </Card>
  );
}

/**
 * §S1. Now, or a date and time.
 *
 * Native date and time inputs — the platform already has a picker, it already
 * knows the locale, and it already works on a phone, which is where half of
 * this will be used. A library here would be a dependency to carry forever in
 * exchange for a different-looking calendar.
 *
 * The time is read as Kochi wall clock on the server. Nothing here converts
 * anything: a date that round-trips through a browser's timezone is a date that
 * goes out an hour early somewhere.
 */
function SchedulePicker({
  today,
  tomorrow,
}: {
  today: string;
  tomorrow: string;
}) {
  const [later, setLater] = useState(false);

  return (
    <div className="rounded-[12px] border border-stone-200 bg-stone-50/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ModeTab active={!later} onClick={() => setLater(false)}>
          Send when I confirm
        </ModeTab>
        <ModeTab active={later} onClick={() => setLater(true)}>
          Schedule it
        </ModeTab>
      </div>

      {/* The radio the server reads. Hidden, because the tabs above are the
          control — but it is a real form value, not component state. */}
      <input type="hidden" name="when" value={later ? "later" : "now"} />

      {later ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Date" required className="w-44">
              <input
                type="date"
                name="scheduleDate"
                required
                min={today}
                defaultValue={tomorrow}
                className={inputClass}
              />
            </Field>
            <Field label="Time" className="w-32" hint="Kochi time">
              <input
                type="time"
                name="scheduleTime"
                defaultValue="10:00"
                className={inputClass}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            You will still see the recipient list and confirm before it is armed.
            Nothing goes out until the time you set.
          </p>
        </>
      ) : (
        <p className="text-xs text-stone-500">
          It goes out as soon as you confirm the recipient list on the next
          screen — about twenty messages a minute.
        </p>
      )}
    </div>
  );
}

function SubmitButton({ ready, count }: { ready: boolean; count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || !ready}>
      {pending
        ? "Preparing…"
        : ready
          ? `Review ${count} recipient${count === 1 ? "" : "s"}`
          : "Review and send"}
    </Button>
  );
}

function PreviewLine({ preview }: { preview: Preview }) {
  const { summary } = preview;
  const excluded = summary.optedOut + summary.unusable + summary.duplicates;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge tone={summary.sendable > 0 ? "green" : "red"}>
        {summary.sendable} will receive it
      </Badge>
      {excluded > 0 && (
        <span className="text-stone-500">
          {summary.optedOut > 0 && `${summary.optedOut} opted out`}
          {summary.optedOut > 0 && (summary.duplicates > 0 || summary.unusable > 0) && " · "}
          {summary.duplicates > 0 && `${summary.duplicates} duplicate`}
          {summary.duplicates > 0 && summary.unusable > 0 && " · "}
          {summary.unusable > 0 && `${summary.unusable} no number`}
        </span>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-[8px] px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-white text-stone-900 shadow-soft"
          : "text-stone-500 hover:text-stone-800",
      )}
    >
      {children}
    </button>
  );
}

/** The attachment, with a preview of what was actually chosen. */
function MediaPicker({
  file,
  objectUrl,
  onPick,
  disabled,
}: {
  file: File | null;
  objectUrl: string | null;
  onPick: (file: File | null) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isImage = file?.type.startsWith("image/");
  const isVideo = file?.type.startsWith("video/");

  return (
    <div className="w-full sm:w-52">
      <span className="text-xs font-semibold tracking-wide text-stone-700">
        Attachment
      </span>
      <div className="mt-1.5 overflow-hidden rounded-[10px] border border-dashed border-stone-300 bg-stone-50">
        {objectUrl && isImage && (
          // A plain img, not next/image: this is a blob: URL that only exists
          // in this tab, so there is nothing for the optimizer to fetch.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={objectUrl} alt="" className="h-40 w-full object-cover" />
        )}
        {objectUrl && isVideo && (
          <video src={objectUrl} controls className="h-40 w-full bg-black object-contain" />
        )}
        {file && !isImage && !isVideo && (
          <div className="flex h-40 flex-col items-center justify-center gap-1 px-3 text-center">
            <Paperclip className="h-5 w-5 text-stone-400" />
            <span className="break-all text-xs text-stone-600">{file.name}</span>
          </div>
        )}
        {!file && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex h-40 w-full flex-col items-center justify-center gap-1.5 text-stone-400 transition hover:text-stone-600 disabled:cursor-not-allowed"
          >
            <Paperclip className="h-5 w-5" />
            <span className="text-xs">Photo, video or PDF</span>
            <span className="text-[11px] text-stone-400">Optional</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        name="media"
        accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,application/pdf"
        disabled={disabled}
        className="hidden"
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
      />

      {file && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-stone-500">
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </span>
          <button
            type="button"
            onClick={() => {
              onPick(null);
              // The file input holds the real value the form posts, so clearing
              // the preview without clearing this would still send the file.
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="text-[11px] text-stone-500 underline hover:text-stone-800"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/** Search-and-tick, for a list assembled by hand. */
function LeadPicker({
  picked,
  onChange,
}: {
  picked: Candidate[];
  onChange: (next: Candidate[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, startSearch] = useTransition();

  // Debounced, because this fires a server action per keystroke otherwise.
  //
  // Nothing is cleared here when the query gets too short — what is shown is
  // derived from the query below instead. Clearing it from the effect is a
  // setState in an effect body, which is a cascading render for a result the
  // render pass can work out for itself.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const timer = setTimeout(() => {
      startSearch(async () => {
        const result = await searchLeads(trimmed);
        if (result.ok) setResults(result.data);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const searchable = query.trim().length >= 2;
  const visible = searchable ? results : [];
  const pickedIds = new Set(picked.map((candidate) => candidate.leadId));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, number, email or reference…"
          className={cx(inputClass, "pl-9")}
        />
      </div>

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((candidate) => (
            <span
              key={candidate.leadId}
              className="inline-flex items-center gap-1 rounded-full bg-pine-50 px-2.5 py-1 text-xs text-pine-800"
            >
              {candidate.name}
              <button
                type="button"
                aria-label={`Remove ${candidate.name}`}
                onClick={() =>
                  onChange(picked.filter((entry) => entry.leadId !== candidate.leadId))
                }
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {searching && <p className="text-xs text-stone-500">Searching…</p>}

      {visible.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-[10px] border border-stone-200 bg-white">
          {visible.map((candidate) => {
            const already = pickedIds.has(candidate.leadId);
            return (
              <li key={candidate.leadId}>
                <button
                  type="button"
                  disabled={already || Boolean(candidate.excluded)}
                  onClick={() => onChange([...picked, candidate])}
                  className="flex w-full items-center justify-between gap-3 border-b border-stone-100 px-3 py-2 text-left text-xs transition last:border-0 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  <span>
                    {candidate.name}
                    <span className="ml-2 text-stone-400">{candidate.reference}</span>
                  </span>
                  {candidate.excluded ? (
                    <Badge tone="neutral">{candidate.excluded}</Badge>
                  ) : already ? (
                    <span className="text-stone-400">added</span>
                  ) : (
                    <span className="text-pine-700">add</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {searchable && !searching && visible.length === 0 && (
        <p className="text-xs text-stone-500">Nothing matched.</p>
      )}
    </div>
  );
}

const str = (value: FormDataEntryValue | null): string | undefined => {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
};
