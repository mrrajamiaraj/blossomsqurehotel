import Link from "next/link";
import type { ReactNode } from "react";
import { IDown, IUp } from "../icons";
import styles from "./kit.module.css";

/* ==========================================================================
   Admin kit — page scaffolding for the front desk. Server-safe pieces live
   here; interactive ones (DataTable, ConfirmDialog) are in their own files.
   All of them assume an ancestor `.admin` (tokens from admin.css).
   ========================================================================== */

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerText}>
        {eyebrow && <p className="a-eyebrow">{eyebrow}</p>}
        <h1 className="a-title">{title}</h1>
        {description && <p className="a-muted">{description}</p>}
      </div>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </header>
  );
}

export type Delta = { value: string; direction: "up" | "down" | "flat"; /** Is this direction good news? */ good?: boolean };

/**
 * KPI tile. Direction is never shown by colour alone: an arrow and the signed
 * value carry it, and screen readers get "up 12% on last week".
 */
export function StatCard({ label, value, delta, hint, href }: { label: string; value: ReactNode; delta?: Delta; hint?: ReactNode; href?: string }) {
  const tone = !delta || delta.direction === "flat" ? "flat" : delta.good ? "good" : "bad";
  const body = (
    <>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {(delta || hint) && (
        <span className={styles.statFoot}>
          {delta && (
            <span className={styles.delta} data-tone={tone}>
              {delta.direction === "up" ? <IUp size={12} /> : delta.direction === "down" ? <IDown size={12} /> : null}
              <span className="sr-only">{delta.direction === "flat" ? "unchanged" : delta.direction}</span>
              {delta.value}
            </span>
          )}
          {hint}
        </span>
      )}
    </>
  );
  return (
    <div className={styles.stat} data-href={href ? "" : undefined}>
      {href ? (
        <Link href={href} className={styles.statLink}>
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

export function StatGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section className={styles.stats} aria-label={label}>
      {children}
    </section>
  );
}

/** Bordered section with a header row. `flush` drops body padding (for tables). */
export function Panel({ title, actions, children, flush, id }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; id?: string }) {
  return (
    <section className="a-panel" aria-labelledby={title ? id && `${id}-title` : undefined} id={id}>
      {(title || actions) && (
        <div className="a-panel-head">
          {title && (
            <h2 className="a-h2" id={id && `${id}-title`}>
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {flush ? children : <div className="a-panel-body">{children}</div>}
    </section>
  );
}

export function Toolbar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className={styles.toolbar} role="toolbar">
      {children}
      {end && <div className={styles.toolbarEnd}>{end}</div>}
    </div>
  );
}

export function AdminEmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="a-empty">
      <strong>{title}</strong>
      {children && <span>{children}</span>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

export { styles as kitStyles };
