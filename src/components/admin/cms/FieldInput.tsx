"use client";

import { useState } from "react";
import type { Field, FieldError, ImageValue, Values } from "@/lib/cms/fields";
import MediaPicker, { previewSrc, type LocalPhoto } from "./MediaPicker";

type Ctx = { local: LocalPhoto[]; errors: FieldError[]; disabled?: boolean; folder: string };

const errorFor = (ctx: Ctx, path: string) => ctx.errors.find((e) => e.path === path || e.path.startsWith(`${path}.`))?.message;

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

function emptyItem(fields: Field[]): Values {
  return Object.fromEntries(
    fields.map((f) => [f.name, f.type === "list" || f.type === "strings" || f.type === "images" ? [] : f.type === "image" ? null : f.type === "select" ? f.options[0]?.value ?? "" : ""]),
  );
}

/** One field of a content section, by type. Lists render their own fields recursively. */
export default function FieldInput({ field, value, onChange, path, ctx }: { field: Field; value: unknown; onChange: (v: unknown) => void; path: string; ctx: Ctx }) {
  const error = errorFor(ctx, path);
  const id = `f-${path.replace(/[^a-z0-9]/gi, "-")}`;
  const hint = "hint" in field ? field.hint : undefined;
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  const label = (
    <span className="a-label">
      {field.label}
      {"required" in field && field.required ? <span aria-hidden="true"> *</span> : null}
    </span>
  );
  const foot = (
    <>
      {hint && (
        <span id={`${id}-hint`} className="a-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} className="a-error" role="alert">
          {error}
        </span>
      )}
    </>
  );

  switch (field.type) {
    case "text":
    case "url":
    case "email": {
      const v = String(value ?? "");
      const max = field.type === "text" ? field.max : 500;
      return (
        <label className="a-field" htmlFor={id}>
          {label}
          <input
            id={id}
            className="a-input"
            type={field.type === "email" ? "email" : "text"}
            inputMode={field.type === "url" ? "url" : undefined}
            value={v}
            maxLength={max ? max + 20 : undefined}
            placeholder={field.type === "text" ? field.placeholder : field.type === "url" ? (field.internal ? "/booking" : "https://…") : undefined}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            disabled={ctx.disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.type === "text" && max && v.length > max * 0.8 && (
            <span className="a-hint" aria-live="polite">
              {v.length}/{max}
            </span>
          )}
          {foot}
        </label>
      );
    }
    case "textarea": {
      const v = String(value ?? "");
      return (
        <label className="a-field" htmlFor={id}>
          {label}
          <textarea
            id={id}
            className="a-input"
            rows={field.rows ?? 4}
            value={v}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            disabled={ctx.disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.max && v.length > field.max * 0.8 && (
            <span className="a-hint" aria-live="polite">
              {v.length}/{field.max}
            </span>
          )}
          {foot}
        </label>
      );
    }
    case "select":
      return (
        <label className="a-field" htmlFor={id}>
          {label}
          <select id={id} className="a-input" value={String(value ?? "")} disabled={ctx.disabled} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {foot}
        </label>
      );
    case "image":
      return (
        <div className="a-field" role="group" aria-labelledby={`${id}-l`}>
          <span id={`${id}-l`}>{label}</span>
          <ImageInput value={(value as ImageValue | null) ?? null} onChange={onChange} ctx={ctx} label={field.label} error={Boolean(error)} />
          {foot}
        </div>
      );
    case "images": {
      const list = (Array.isArray(value) ? value : []) as ImageValue[];
      return (
        <div className="a-field" role="group" aria-labelledby={`${id}-l`}>
          <span id={`${id}-l`}>{label}</span>
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {list.map((img, i) => (
              <li key={`${img.src}-${i}`} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <ImageInput value={img} onChange={(v) => onChange(v ? list.map((x, j) => (j === i ? (v as ImageValue) : x)) : list.filter((_, j) => j !== i))} ctx={ctx} label={`${field.label} ${i + 1}`} error={Boolean(errorFor(ctx, `${path}.${i}`))} />
                </div>
                <Reorder i={i} n={list.length} onMove={(to) => onChange(move(list, i, to))} label={`photo ${i + 1}`} disabled={ctx.disabled} />
              </li>
            ))}
          </ul>
          {(!field.max || list.length < field.max) && <AddImage ctx={ctx} onAdd={(img) => onChange([...list, img])} />}
          {foot}
        </div>
      );
    }
    case "strings": {
      const list = (Array.isArray(value) ? value : []) as string[];
      const itemLabel = field.itemLabel ?? "Line";
      return (
        <fieldset className="a-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ padding: 0 }}>{label}</legend>
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map((s, i) => (
              <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {(field.itemMax ?? 160) > 200 ? (
                  <textarea className="a-input" rows={3} value={s} aria-label={`${itemLabel} ${i + 1}`} disabled={ctx.disabled} onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} />
                ) : (
                  <input className="a-input" value={s} aria-label={`${itemLabel} ${i + 1}`} disabled={ctx.disabled} onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} />
                )}
                <Reorder i={i} n={list.length} onMove={(to) => onChange(move(list, i, to))} label={`${itemLabel.toLowerCase()} ${i + 1}`} disabled={ctx.disabled} />
                <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={ctx.disabled} onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Remove ${itemLabel.toLowerCase()} ${i + 1}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {(!field.max || list.length < field.max) && (
            <button type="button" className="a-btn a-btn--sm" style={{ alignSelf: "flex-start" }} disabled={ctx.disabled} onClick={() => onChange([...list, ""])}>
              + Add {itemLabel.toLowerCase()}
            </button>
          )}
          {foot}
        </fieldset>
      );
    }
    case "list": {
      const list = (Array.isArray(value) ? value : []) as Values[];
      return (
        <fieldset className="a-field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ padding: 0 }}>{label}</legend>
          <ol role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {list.map((item, i) => (
              <ListItem
                key={i}
                field={field}
                item={item}
                index={i}
                count={list.length}
                path={`${path}.${i}`}
                ctx={ctx}
                onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))}
                onMove={(to) => onChange(move(list, i, to))}
                onRemove={() => onChange(list.filter((_, j) => j !== i))}
              />
            ))}
          </ol>
          {(!field.max || list.length < field.max) && (
            <button type="button" className="a-btn a-btn--sm" style={{ alignSelf: "flex-start" }} disabled={ctx.disabled} onClick={() => onChange([...list, emptyItem(field.fields)])}>
              + Add {field.itemLabel.toLowerCase()}
            </button>
          )}
          {foot}
        </fieldset>
      );
    }
  }
}

function ListItem({
  field,
  item,
  index,
  count,
  path,
  ctx,
  onChange,
  onMove,
  onRemove,
}: {
  field: Extract<Field, { type: "list" }>;
  item: Values;
  index: number;
  count: number;
  path: string;
  ctx: Ctx;
  onChange: (v: Values) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const hasError = ctx.errors.some((e) => e.path.startsWith(`${path}.`));
  const [open, setOpen] = useState(hasError || !String(item[field.summary ?? field.fields[0].name] ?? ""));
  const title = String(item[field.summary ?? field.fields[0].name] ?? "") || `New ${field.itemLabel.toLowerCase()}`;
  return (
    <li style={{ border: `1px solid ${hasError ? "var(--a-danger, #b42318)" : "var(--a-line)"}`, borderRadius: 8, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open || hasError}
          style={{ flex: 1, textAlign: "left", background: "none", border: 0, padding: "4px 0", cursor: "pointer", fontWeight: 500, color: "var(--a-ink)" }}
        >
          <span aria-hidden="true" style={{ display: "inline-block", width: 16 }}>
            {open || hasError ? "▾" : "▸"}
          </span>
          {field.itemLabel} {index + 1}: {title}
        </button>
        <Reorder i={index} n={count} onMove={onMove} label={`${field.itemLabel.toLowerCase()} ${index + 1}`} disabled={ctx.disabled} />
        <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={ctx.disabled} onClick={onRemove} aria-label={`Remove ${field.itemLabel.toLowerCase()} ${index + 1}`}>
          Remove
        </button>
      </div>
      {(open || hasError) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 14px 14px" }}>
          {field.fields.map((f) => (
            <FieldInput key={f.name} field={f} value={item[f.name]} path={`${path}.${f.name}`} ctx={ctx} onChange={(v) => onChange({ ...item, [f.name]: v })} />
          ))}
        </div>
      )}
    </li>
  );
}

function Reorder({ i, n, onMove, label, disabled }: { i: number; n: number; onMove: (to: number) => void; label: string; disabled?: boolean }) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={disabled || i === 0} onClick={() => onMove(i - 1)} aria-label={`Move ${label} up`} title="Move up">
        ↑
      </button>
      <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={disabled || i === n - 1} onClick={() => onMove(i + 1)} aria-label={`Move ${label} down`} title="Move down">
        ↓
      </button>
    </span>
  );
}

function ImageInput({ value, onChange, ctx, label, error }: { value: ImageValue | null; onChange: (v: unknown) => void; ctx: Ctx; label: string; error: boolean }) {
  const [picking, setPicking] = useState(false);
  const src = value ? previewSrc(value.src, ctx.local) : null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 12, alignItems: "start", padding: 10, border: `1px solid ${error ? "var(--a-danger, #b42318)" : "var(--a-line)"}`, borderRadius: 8, background: "#fff" }}>
      <div style={{ aspectRatio: "4 / 3", borderRadius: 6, overflow: "hidden", background: "var(--a-line)", display: "grid", placeItems: "center" }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span className="a-hint">{value?.src ? "Not found" : "No photo"}</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {value && (
          <input
            className="a-input"
            value={value.alt}
            placeholder="Describe the photo, e.g. “The pool at sunset”"
            aria-label={`${label}: description for screen readers`}
            disabled={ctx.disabled}
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
          />
        )}
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" className="a-btn a-btn--sm" disabled={ctx.disabled} onClick={() => setPicking(true)}>
            {value ? "Change photo" : "Choose photo"}
          </button>
          {value && (
            <button type="button" className="a-btn a-btn--sm a-btn--ghost" disabled={ctx.disabled} onClick={() => onChange(null)}>
              Remove
            </button>
          )}
        </span>
      </div>
      <MediaPicker open={picking} onClose={() => setPicking(false)} local={ctx.local} folder={ctx.folder} onPick={(img) => onChange({ src: img.src, alt: img.alt || value?.alt || "" })} />
    </div>
  );
}

function AddImage({ ctx, onAdd }: { ctx: Ctx; onAdd: (img: ImageValue) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <button type="button" className="a-btn a-btn--sm" style={{ alignSelf: "flex-start" }} disabled={ctx.disabled} onClick={() => setPicking(true)}>
        + Add photo
      </button>
      <MediaPicker open={picking} onClose={() => setPicking(false)} local={ctx.local} folder={ctx.folder} onPick={onAdd} />
    </>
  );
}
