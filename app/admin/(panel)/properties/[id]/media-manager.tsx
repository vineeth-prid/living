"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { ArrowDown, ArrowUp, Eye, EyeOff, Star, Trash2 } from "lucide-react";
import {
  deleteMedia,
  reorderMedia,
  setMediaVisibility,
  setPrimaryMedia,
  uploadMedia,
} from "../actions";
import {
  Button,
  Card,
  ErrorText,
  Field,
  cx,
  inputClass,
} from "@/components/admin/ui";
import type { ActionResult } from "@/lib/auth/dal";
import { UPLOAD_LIMITS, asMb } from "@/lib/upload-limits";

export type MediaItem = {
  id: string;
  kind: string;
  url: string;
  storageKey: string;
  caption: string | null;
  isPublic: boolean;
  isPrimary: boolean;
};

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Uploading…" : "Upload"}
    </Button>
  );
}

/** Which kinds reach the website, and which never do (§10). */
const PUBLIC_KINDS = ["image", "floor_plan"];

export function MediaManager({
  propertyId,
  media,
  storageReady,
}: {
  propertyId: string;
  media: MediaItem[];
  storageReady: boolean;
}) {
  const upload = uploadMedia.bind(null, propertyId);
  const [state, formAction] = useActionState<ActionResult<null> | null, FormData>(
    upload,
    null,
  );
  const [pending, start] = useTransition();
  // Optimistic ordering so arrow clicks feel instant.
  const [items, setItems] = useState(media);
  const [tooBig, setTooBig] = useState<string | null>(null);

  // …but the server stays the source of truth. Without this, `items` kept its
  // initial value for the life of the component: an upload revalidated the
  // page, the new rows arrived as props, and the grid went on showing the old
  // list until someone reloaded by hand. Comparing ids rather than the array
  // itself — the server hands back a fresh array on every render.
  const signature = media.map((m) => m.id).join();
  const [snapshot, setSnapshot] = useState(signature);
  if (snapshot !== signature) {
    setSnapshot(signature);
    setItems(media);
  }

  const move = (index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    start(async () => {
      await reorderMedia(propertyId, next.map((m) => m.id));
    });
  };

  return (
    <Card title="Media">
      {!storageReady && (
        <p className="mb-4 rounded-[10px] bg-clay-50 px-3 py-2 text-xs text-clay-800">
          MinIO isn&apos;t configured. Set MINIO_ENDPOINT, MINIO_BUCKET and the
          access keys in .env.local before uploading.
        </p>
      )}

      {tooBig && (
        <div className="mb-4">
          <ErrorText>{tooBig}</ErrorText>
        </div>
      )}

      <form
        action={formAction}
        onSubmit={(event) => {
          const input = event.currentTarget.elements.namedItem(
            "files",
          ) as HTMLInputElement | null;
          const kindInput = event.currentTarget.elements.namedItem(
            "kind",
          ) as HTMLSelectElement | null;
          const group =
            kindInput?.value === "video"
              ? "video"
              : kindInput?.value === "document"
                ? "document"
                : "image";
          const limit = UPLOAD_LIMITS[group];

          const oversized = Array.from(input?.files ?? []).filter(
            (file) => file.size > limit,
          );
          if (oversized.length) {
            event.preventDefault();
            setTooBig(
              `${oversized.map((f) => f.name).join(", ")} — over the ${asMb(limit)} limit for ${group}s. Nothing was uploaded.`,
            );
            return;
          }
          setTooBig(null);
        }}
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        {state && !state.ok && (
          <div className="w-full">
            <ErrorText>{state.error}</ErrorText>
          </div>
        )}
        <Field label="Type" className="w-40">
          <select name="kind" className={inputClass} defaultValue="image">
            <option value="image">Photos</option>
            <option value="video">Video</option>
            <option value="sketch">Sketch</option>
            <option value="floor_plan">Floor plan</option>
            <option value="document">Document</option>
          </select>
        </Field>
        <Field label="Files" className="flex-1 min-w-[16rem]">
          <input
            type="file"
            name="files"
            multiple
            required
            disabled={!storageReady}
            className={cx(inputClass, "file:mr-3 file:rounded file:border-0 file:bg-stone-200 file:px-3 file:py-1 file:text-xs")}
          />
        </Field>
        <UploadButton />
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-stone-500">
          No media yet. A listing needs at least one public photo before it can
          be published.
        </p>
      ) : (
        <Section
          items={items}
          renderItem={(item, index) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-[12px] border border-stone-200 bg-white"
            >
              <div className="relative aspect-[4/3] bg-stone-100">
                {item.kind === "image" || item.kind === "sketch" || item.kind === "floor_plan" ? (
                  <Image
                    src={item.url}
                    alt={item.caption ?? ""}
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-stone-500">
                    {item.kind === "video" ? "Video" : "Document"}
                  </div>
                )}
                {item.isPrimary && (
                  <span className="absolute left-2 top-2 rounded-full bg-pine-600 px-2 py-0.5 text-[10px] text-white">
                    Primary
                  </span>
                )}
                {!item.isPublic && (
                  <span className="absolute right-2 top-2 rounded-full bg-stone-900/80 px-2 py-0.5 text-[10px] text-white">
                    Internal
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-1 px-2 py-2">
                <div className="flex gap-0.5">
                  <IconButton label="Move up" onClick={() => move(index, -1)} disabled={pending || index === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton label="Move down" onClick={() => move(index, 1)} disabled={pending || index === items.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
                <div className="flex gap-0.5">
                  <IconButton
                    label="Set as primary"
                    disabled={pending || item.isPrimary || item.kind !== "image"}
                    onClick={() => start(async () => { await setPrimaryMedia(propertyId, item.id); })}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label={item.isPublic ? "Make internal" : "Make public"}
                    disabled={pending}
                    onClick={() => start(async () => { await setMediaVisibility(item.id, !item.isPublic); })}
                  >
                    {item.isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </IconButton>
                  <IconButton
                    label="Delete"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        if (!confirm("Delete this file?")) return;
                        await deleteMedia(item.id);
                        setItems((prev) => prev.filter((m) => m.id !== item.id));
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[var(--color-danger)]" />
                  </IconButton>
                </div>
              </div>
            </li>
          )}
        />
      )}
    </Card>
  );
}

/**
 * Photos and plans in one grid, documents in another.
 *
 * The rule that documents and sketches stay off the website already lives in
 * attachMedia; showing them apart is what makes it visible to whoever is
 * uploading a signed agreement.
 */
function Section({
  items,
  renderItem,
}: {
  items: MediaItem[];
  renderItem: (item: MediaItem, index: number) => React.ReactNode;
}) {
  const shown = items.filter((item) => PUBLIC_KINDS.includes(item.kind));
  const internal = items.filter((item) => !PUBLIC_KINDS.includes(item.kind));

  return (
    <>
      {shown.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => renderItem(item, items.indexOf(item)))}
        </ul>
      )}

      {internal.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Documents & attachments · internal
          </h3>
          <p className="mb-3 text-xs text-stone-500">
            Never shown on the website or to a customer. Agreements, tax
            receipts, sketches and anything else that belongs to the file.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {internal.map((item) => renderItem(item, items.indexOf(item)))}
          </ul>
        </>
      )}
    </>
  );
}

function IconButton({
  label,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...props}
      className="rounded p-1.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
