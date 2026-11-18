"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { discardSectionDraft, publishSection, restoreSectionVersion, saveSectionDraft, sectionVersions } from "@/app/admin/cms";
import type { FieldError, Group, Values } from "@/lib/cms/fields";
import type { ContentVersion } from "@/lib/cms/repo";
import ConfirmDialog from "../kit/ConfirmDialog";
import Dialog from "../Dialog";
import { toast } from "../../ui/Toaster";
import FieldInput from "./FieldInput";
import type { LocalPhoto } from "./MediaPicker";

type Props = {
  sectionKey: string;
  label: string;
  description: string;
  path: string;
  groups: Group[];
  /** What the editor starts from: the draft, else the live version, else the built-in text. */
  initial: Values;
  base: string | null;
  status: "builtin" | "live" | "draft";
  publishedAt: string | null;
  draftBy: string | null;
  draftAt: string | null;
  local: LocalPhoto[];
  live: boolean;
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function SectionEditor(p: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(p.initial);
  const [saved, setSaved] = useState(JSON.stringify(p.initial));
  const [base, setBase] = useState<string | null>(p.base);
  const [hasDraft, setHasDraft] = useState(p.status === "draft");
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"publish" | "discard" | null>(null);
  const [history, setHistory] = useState<ContentVersion[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = JSON.stringify(values) !== saved;
  const ctx = useMemo(() => ({ local: p.local, errors, disabled: pending || !p.live, folder: p.sectionKey }), [p.local, errors, pending, p.live, p.sectionKey]);

  // Don't lose work by closing the tab.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save(): Promise<string | null | false> {
    const res = await saveSectionDraft(p.sectionKey, values, base);
    if (!res.ok) {
      setErrors(res.errors ?? []);
      toast.error(res.message);
      if (res.errors?.length) document.getElementById(`f-${res.errors[0].path.replace(/[^a-z0-9]/gi, "-")}`)?.focus();
      return false;
    }
    setErrors([]);
    setBase(res.data.base);
    setSaved(JSON.stringify(values));
    setHasDraft(true);
    return res.data.base;
  }

  const saveDraft = () =>
    start(async () => {
      if ((await save()) !== false) {
        toast.success("Draft saved — visitors still see the published version");
        router.refresh();
      }
    });

  const preview = () =>
    start(async () => {
      if (dirty && (await save()) === false) return;
      window.open(`/admin/preview?path=${encodeURIComponent(p.path)}`, "_blank", "noopener");
    });

  const publish = () =>
    start(async () => {
      const stamp = dirty ? await save() : base;
      if (stamp === false) return setConfirm(null);
      const res = await publishSection(p.sectionKey, stamp);
      setConfirm(null);
      if (!res.ok) return void toast.error(res.message);
      setHasDraft(false);
      setBase(null);
      toast.success(res.message ?? "Published");
      router.refresh();
    });

  const discard = () =>
    start(async () => {
      const res = await discardSectionDraft(p.sectionKey);
      setConfirm(null);
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message ?? "Discarded");
      router.refresh();
      // The page reloads with the live (or built-in) text.
      window.location.reload();
    });

  const openHistory = () =>
    start(async () => {
      const res = await sectionVersions(p.sectionKey);
      if (!res.ok) return void toast.error(res.message);
      setHistory(res.data);
      setHistoryOpen(true);
    });

  const restore = (version: number) =>
    start(async () => {
      const res = await restoreSectionVersion(p.sectionKey, version);
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message ?? "Restored");
      window.location.reload();
    });

  const statusText = dirty
    ? "Unsaved changes"
    : hasDraft
      ? `Draft saved${p.draftBy ? ` by ${p.draftBy}` : ""}${p.draftAt ? `, ${when(p.draftAt)}` : ""} — not live yet`
      : p.status === "builtin"
        ? "Showing the built-in text"
        : `Live since ${when(p.publishedAt)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        className="a-panel"
        style={{ position: "sticky", top: 0, zIndex: 5, padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}
      >
        <span className="a-badge" data-s={dirty || hasDraft ? "pending" : p.status === "builtin" ? "checked_out" : "confirmed"} aria-live="polite">
          {statusText}
        </span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {p.status !== "builtin" && (
            <button type="button" className="a-btn a-btn--sm a-btn--ghost" onClick={openHistory} disabled={pending || !p.live}>
              History
            </button>
          )}
          {hasDraft && (
            <button type="button" className="a-btn a-btn--sm a-btn--ghost" onClick={() => setConfirm("discard")} disabled={pending}>
              Discard changes
            </button>
          )}
          <button type="button" className="a-btn a-btn--sm" onClick={preview} disabled={pending || !p.live}>
            Preview
          </button>
          <button type="button" className="a-btn a-btn--sm" onClick={saveDraft} disabled={pending || !dirty || !p.live}>
            {pending && <span className="a-spin" aria-hidden="true" />}
            Save draft
          </button>
          <button type="button" className="a-btn a-btn--sm a-btn--primary" onClick={() => setConfirm("publish")} disabled={pending || (!dirty && !hasDraft) || !p.live}>
            Publish
          </button>
        </span>
      </div>

      {!p.live && <p className="a-hint">Editing needs Supabase. In preview you can look around, but nothing is saved.</p>}
      {errors.length > 1 && (
        <div className="a-panel" role="alert" style={{ padding: 16, borderColor: "var(--a-danger, #b42318)" }}>
          <strong>Fix these before saving:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {errors.slice(0, 8).map((e) => (
              <li key={e.path}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {p.groups.map((g) => (
        <section key={g.title} className="a-panel" aria-labelledby={`g-${g.title}`}>
          <div className="a-panel-head" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <h2 className="a-h2" id={`g-${g.title}`}>
              {g.title}
            </h2>
            {g.description && <span className="a-hint">{g.description}</span>}
          </div>
          <div className="a-panel-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {g.fields.map((f) => (
              <FieldInput key={f.name} field={f} value={values[f.name]} path={f.name} ctx={ctx} onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))} />
            ))}
          </div>
        </section>
      ))}

      <p className="a-hint">
        <Link href="/admin/content" className="text-link">
          ← All website content
        </Link>
      </p>

      <ConfirmDialog
        open={confirm === "publish"}
        onClose={() => setConfirm(null)}
        onConfirm={publish}
        pending={pending}
        title={`Publish ${p.label.toLowerCase()}?`}
        description="Visitors will see these changes straight away. The previous version is kept in History, so you can bring it back."
        confirmLabel="Publish now"
      />
      <ConfirmDialog
        open={confirm === "discard"}
        onClose={() => setConfirm(null)}
        onConfirm={discard}
        pending={pending}
        destructive
        title="Discard unpublished changes?"
        description={p.status === "draft" && !p.publishedAt ? "This section goes back to the built-in text." : "The draft is deleted. The live version stays as it is."}
        confirmLabel="Discard"
      />
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Published versions" description="Bring back an earlier version as a draft, check it with Preview, then publish it.">
        {history && history.length === 0 && <p className="a-hint">No earlier versions yet.</p>}
        <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {history?.map((v) => (
            <li key={v.version} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", borderBottom: "1px solid var(--a-line)", paddingBottom: 8 }}>
              <span>
                <strong>Version {v.version}</strong>
                <span className="a-hint" style={{ display: "block" }}>
                  {when(v.published_at)}
                  {v.published_by ? ` · ${v.published_by}` : ""}
                </span>
              </span>
              <button type="button" className="a-btn a-btn--sm" disabled={pending} onClick={() => restore(v.version)}>
                Use as draft
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
