// Field types for editable website sections, and the validation every save
// goes through on the server. Shared by the admin editor (client) and the
// public site (server), so it must stay free of server-only imports.

export type ImageValue = { src: string; alt: string };

export type Field =
  | { type: "text"; name: string; label: string; hint?: string; max?: number; required?: boolean; accent?: boolean; placeholder?: string }
  | { type: "textarea"; name: string; label: string; hint?: string; max?: number; required?: boolean; rows?: number }
  | { type: "url"; name: string; label: string; hint?: string; required?: boolean; internal?: boolean }
  | { type: "email"; name: string; label: string; hint?: string; required?: boolean }
  | { type: "select"; name: string; label: string; hint?: string; options: { value: string; label: string }[] }
  | { type: "image"; name: string; label: string; hint?: string; required?: boolean }
  | { type: "images"; name: string; label: string; hint?: string; max?: number }
  | { type: "strings"; name: string; label: string; hint?: string; max?: number; itemMax?: number; itemLabel?: string }
  | { type: "list"; name: string; label: string; hint?: string; max?: number; min?: number; itemLabel: string; fields: Field[]; summary?: string };

export type Group = { title: string; description?: string; fields: Field[] };

export type Values = Record<string, unknown>;

export type FieldError = { path: string; message: string };

const TEXT_MAX = 300;
const AREA_MAX = 2000;

/** Image sources: a photo in public/photos (ref), a site path, or an upload in this project's public buckets. */
export function imageSourceOk(src: string, storageBase: string | null): boolean {
  if (/^[A-Za-z0-9_-]{2,60}$/.test(src)) return true; // public/photos ref, e.g. DSC5566
  if (/^\/(photos|brand)\/[A-Za-z0-9._-]{1,120}$/.test(src)) return true;
  if (!storageBase) return false;
  return new RegExp(`^${escapeRe(storageBase)}/storage/v1/object/public/(site-media|room-photos)/[A-Za-z0-9/._-]{3,200}$`).test(src) && !src.includes("..");
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

function urlOk(v: string, internal?: boolean) {
  if (internal) return /^\/[A-Za-z0-9/_#?=&.-]*$/.test(v);
  return /^\/[A-Za-z0-9/_#?=&.-]*$/.test(v) || /^(https:\/\/|mailto:|tel:)[^\s<>"']{2,500}$/.test(v);
}

/**
 * Cleans a section's values against its fields: unknown keys are dropped,
 * text is trimmed and limited, links and images are checked. Returns the
 * clean values and any errors (by field path, for the editor to highlight).
 */
export function validate(fields: Field[], input: unknown, storageBase: string | null, prefix = ""): { value: Values; errors: FieldError[] } {
  const src = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Values;
  const value: Values = {};
  const errors: FieldError[] = [];
  const err = (name: string, message: string) => errors.push({ path: prefix + name, message });

  for (const f of fields) {
    const raw = src[f.name];
    switch (f.type) {
      case "text":
      case "textarea": {
        const v = clean(raw);
        const max = f.max ?? (f.type === "text" ? TEXT_MAX : AREA_MAX);
        if (f.required && !v) err(f.name, `${f.label} can't be empty.`);
        else if (v.length > max) err(f.name, `${f.label} is too long (${v.length}/${max} characters).`);
        if (f.type === "text" && v.includes("\n")) err(f.name, `${f.label} must be a single line.`);
        value[f.name] = v;
        break;
      }
      case "url": {
        const v = clean(raw);
        if (f.required && !v) err(f.name, `${f.label} can't be empty.`);
        else if (v && !urlOk(v, f.internal)) err(f.name, f.internal ? `${f.label} must be a page on this site, starting with /.` : `${f.label} must start with https://, /, mailto: or tel:.`);
        value[f.name] = v;
        break;
      }
      case "email": {
        const v = clean(raw).toLowerCase();
        if (f.required && !v) err(f.name, `${f.label} can't be empty.`);
        else if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) err(f.name, `${f.label} isn't a valid email address.`);
        value[f.name] = v;
        break;
      }
      case "select": {
        const v = clean(raw);
        value[f.name] = f.options.some((o) => o.value === v) ? v : f.options[0]?.value ?? "";
        break;
      }
      case "image": {
        const img = imageValue(raw);
        if (!img.src) {
          if (f.required) err(f.name, `Choose a photo for ${f.label.toLowerCase()}.`);
        } else if (!imageSourceOk(img.src, storageBase)) err(f.name, `${f.label}: that image can't be used. Pick one from the media library.`);
        else if (img.alt.length < 3) err(f.name, `${f.label}: describe the photo in a few words (for screen readers and search engines).`);
        else if (img.alt.length > 200) err(f.name, `${f.label}: the description is too long.`);
        value[f.name] = img.src ? img : null;
        break;
      }
      case "images": {
        const list = (Array.isArray(raw) ? raw : []).map(imageValue).filter((i) => i.src);
        if (f.max && list.length > f.max) err(f.name, `${f.label}: up to ${f.max} photos.`);
        list.forEach((img, i) => {
          if (!imageSourceOk(img.src, storageBase)) err(`${f.name}.${i}`, `${f.label}, photo ${i + 1}: that image can't be used.`);
          else if (img.alt.length < 3) err(`${f.name}.${i}`, `${f.label}, photo ${i + 1}: describe the photo in a few words.`);
        });
        value[f.name] = list;
        break;
      }
      case "strings": {
        const list = (Array.isArray(raw) ? raw : []).map(clean).filter(Boolean);
        if (f.max && list.length > f.max) err(f.name, `${f.label}: up to ${f.max} lines.`);
        const itemMax = f.itemMax ?? 160;
        list.forEach((s, i) => s.length > itemMax && err(`${f.name}.${i}`, `${f.label}, line ${i + 1} is too long.`));
        value[f.name] = list;
        break;
      }
      case "list": {
        const items = Array.isArray(raw) ? raw : [];
        if (f.max && items.length > f.max) err(f.name, `${f.label}: up to ${f.max} ${f.itemLabel.toLowerCase()}s.`);
        if (f.min && items.length < f.min) err(f.name, `${f.label}: at least ${f.min}.`);
        value[f.name] = items.slice(0, f.max ?? 50).map((item, i) => {
          const r = validate(f.fields, item, storageBase, `${prefix}${f.name}.${i}.`);
          errors.push(...r.errors);
          return r.value;
        });
        break;
      }
    }
  }
  return { value, errors };
}

export function imageValue(raw: unknown): ImageValue {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return { src: clean(r.src), alt: clean(r.alt) };
  }
  return { src: "", alt: "" };
}

/** Field list of a section's groups, flattened. */
export const allFields = (groups: Group[]) => groups.flatMap((g) => g.fields);

/**
 * Published values over the built-in defaults, field by field: anything
 * missing or of the wrong shape falls back, so a half-filled section never
 * breaks a page.
 */
export function mergeDefaults<T extends Values>(defaults: T, stored: unknown): T {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaults;
  const s = stored as Values;
  const out: Values = { ...defaults };
  for (const [k, def] of Object.entries(defaults)) {
    const v = s[k];
    if (v === undefined) continue;
    if (v === null) {
      // A photo the editor removed stays removed; other blanks fall back.
      if (def === null || (def && typeof def === "object" && !Array.isArray(def))) out[k] = null;
      continue;
    }
    if (Array.isArray(def)) {
      if (Array.isArray(v)) out[k] = v;
    } else if (def && typeof def === "object") {
      if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as ImageValue).src === "string" && (v as ImageValue).src) out[k] = v;
    } else if (typeof v === typeof def) {
      // An emptied text keeps the built-in wording only where the field is required; editors can blank optional ones.
      out[k] = v;
    }
  }
  return out as T;
}
