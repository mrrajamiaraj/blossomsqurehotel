"use client";

import { useMemo, useState, type ReactNode } from "react";
import { IDown, IUp } from "../icons";
import { AdminEmptyState, kitStyles as styles } from "./index";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Return a comparable value to make the column sortable. */
  sortValue?: (row: T) => string | number;
  align?: "start" | "end";
  /** Marks the row's primary cell (bold, used as the row header). */
  primary?: boolean;
};

/**
 * Accessible data table on the admin `.a-table` styles. Sortable headers are
 * buttons with aria-sort on the <th>; the primary column is a row header
 * (<th scope="row">) so screen readers announce each row by it. On phones
 * `.a-table--stack` turns rows into labelled cards (data-label).
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty = "Nothing to show yet.",
  initialSort,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Read by screen readers; visually hidden. */
  caption: string;
  empty?: ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
}) {
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort!.dir === "asc" ? r : -r;
    });
  }, [rows, columns, sort]);

  if (!rows.length) return <AdminEmptyState title={typeof empty === "string" ? empty : "Nothing here"}>{typeof empty === "string" ? null : empty}</AdminEmptyState>;

  return (
    <div className="a-table-wrap">
      <table className="a-table a-table--stack">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={c.align === "end" ? { textAlign: "right" } : undefined}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : c.sortValue ? "none" : undefined}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      className={styles.sortBtn}
                      data-active={active || undefined}
                      onClick={() => setSort({ key: c.key, dir: active && sort!.dir === "asc" ? "desc" : "asc" })}
                    >
                      {c.header}
                      {active && sort!.dir === "desc" ? <IDown size={12} /> : <IUp size={12} />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => {
                const props = { "data-label": c.header, style: c.align === "end" ? ({ textAlign: "right" } as const) : undefined };
                return c.primary ? (
                  <th key={c.key} scope="row" className={styles.rowHeader} {...props}>
                    {c.cell(row)}
                  </th>
                ) : (
                  <td key={c.key} {...props}>
                    {c.cell(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
