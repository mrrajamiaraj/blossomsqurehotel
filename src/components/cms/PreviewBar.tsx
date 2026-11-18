import { isPreviewingDrafts } from "@/lib/cms/content";

/** Shown only to editors previewing unpublished changes. */
export default async function PreviewBar() {
  if (!(await isPreviewingDrafts())) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        insetInline: 0,
        bottom: 0,
        zIndex: 1000,
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 16px",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 16px",
        background: "#16201c",
        color: "#f4efe6",
        fontSize: "0.85rem",
      }}
    >
      <strong>Preview — you&apos;re seeing unpublished changes.</strong>
      <span>Visitors still see the published website.</span>
      <a href="/admin/content" style={{ color: "#e6d3a3", textDecoration: "underline" }}>
        Back to editing
      </a>
      <a href="/admin/preview/exit" style={{ color: "#e6d3a3", textDecoration: "underline" }}>
        Exit preview
      </a>
    </div>
  );
}
