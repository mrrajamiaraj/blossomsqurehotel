"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setPreviewRole, signOut } from "@/app/admin/actions";
import type { StaffRole } from "@/lib/data/types";
import { Monogram } from "../icons";
import CommandPalette, { openCommandPalette } from "./CommandPalette";
import {
  IBookings,
  ICalendar,
  IClose,
  ICommand,
  IExternal,
  IGuests,
  ILogout,
  IMenu,
  IPlus,
  IReports,
  IRooms,
  ISearch,
  ISettings,
  IToday,
} from "./icons";
import styles from "./AdminShell.module.css";

type Props = {
  staff: { name: string; role: StaffRole };
  mode: "live" | "preview";
  pending: number;
  dirtyRooms: number;
  children: React.ReactNode;
};

const NAV = [
  { href: "/admin", label: "Today", icon: IToday, exact: true },
  { href: "/admin/bookings", label: "Bookings", icon: IBookings },
  { href: "/admin/calendar", label: "Calendar", icon: ICalendar },
  { href: "/admin/rooms", label: "Rooms & rates", icon: IRooms },
  { href: "/admin/guests", label: "Guests", icon: IGuests },
  { href: "/admin/reports", label: "Reports", icon: IReports },
  { href: "/admin/settings", label: "Settings", icon: ISettings },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export default function AdminShell({ staff, mode, pending, dirtyRooms, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [switching, startSwitch] = useTransition();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <div className={styles.shell}>
      <aside className={`${styles.side} ${open ? styles.sideOpen : ""}`} aria-label="Front desk">
        <div className={styles.brand}>
          <Link href="/admin" className={styles.brandLink}>
            <Monogram size={28} className={styles.mark} />
            <span>
              <span className={styles.brandName}>Blossom Square</span>
              <span className={styles.brandSub}>Front desk</span>
            </span>
          </Link>
          <button type="button" className={styles.closeNav} onClick={() => setOpen(false)} aria-label="Close menu">
            <IClose />
          </button>
        </div>

        <nav className={styles.nav} aria-label="Sections">
          {NAV.filter((n) => n.href !== "/admin/settings" || staff.role === "manager").map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            const badge = href === "/admin/bookings" ? pending : href === "/admin/rooms" ? dirtyRooms : 0;
            return (
              <Link key={href} href={href} className={`${styles.navLink} ${active ? styles.navActive : ""}`} aria-current={active ? "page" : undefined}>
                <Icon />
                <span className={styles.navLabel}>{label}</span>
                {badge > 0 && (
                  <span
                    className={href === "/admin/bookings" ? styles.badge : styles.badgeQuiet}
                    title={href === "/admin/bookings" ? `${badge} awaiting confirmation` : `${badge} rooms to clean`}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className={styles.foot}>
          <Link href="/" className={styles.footLink} target="_blank">
            <IExternal size={16} /> View website
          </Link>
          <div className={styles.user}>
            <span className={styles.avatar} aria-hidden="true">
              {initials(staff.name) || "FD"}
            </span>
            <span className={styles.userText}>
              <Link href="/admin/account" className={styles.userName}>
                {staff.name}
              </Link>
              <span className={styles.userRole}>{staff.role === "manager" ? "Manager" : "Front desk"}</span>
            </span>
            <form action={signOut}>
              <button type="submit" className={styles.signOut} aria-label="Sign out" title="Sign out">
                <ILogout size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {open && <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className={styles.main}>
        {mode === "preview" && (
          <div className={styles.preview} role="note">
            <strong>Preview data</strong>
            <span className={styles.previewText}>
              Supabase isn&apos;t connected. Everything here is sample data held in memory on this computer and resets
              when the dev server restarts.
            </span>
            <span className={styles.previewRole}>
              Viewing as
              <span className="a-seg">
                {(["manager", "front_desk"] as StaffRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={staff.role === r}
                    disabled={switching}
                    onClick={() => startSwitch(() => setPreviewRole(r))}
                  >
                    {r === "manager" ? "Manager" : "Front desk"}
                  </button>
                ))}
              </span>
            </span>
          </div>
        )}

        <header className={styles.top}>
          <button type="button" className={styles.menuBtn} onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
            <IMenu />
          </button>
          <form action="/admin/bookings" method="get" role="search" className={styles.search}>
            <ISearch size={16} />
            <label htmlFor="admin-search" className="sr-only">
              Search bookings
            </label>
            <input
              id="admin-search"
              type="search"
              name="q"
              placeholder="Search guest, phone or reference"
              autoComplete="off"
              className={styles.searchInput}
            />
            <input type="hidden" name="view" value="all" />
            <kbd className={styles.kbd} aria-hidden="true">
              /
            </kbd>
          </form>
          <button
            type="button"
            className={`a-btn ${styles.cmdBtn}`}
            onClick={openCommandPalette}
            aria-label="Open command palette"
            title="Quick actions (Ctrl+K)"
          >
            <ICommand size={16} />
            <span className={styles.cmdLabel}>Quick actions</span>
            <kbd className={styles.kbd} aria-hidden="true">
              Ctrl K
            </kbd>
          </button>
          <Link href="/admin/bookings/new" className="a-btn a-btn--primary">
            <IPlus size={16} />
            <span className={styles.newLabel}>New booking</span>
          </Link>
        </header>

        <main id="main" className={styles.content}>
          {children}
        </main>
      </div>
      <SlashToSearch />
      <CommandPalette role={staff.role} />
    </div>
  );
}

/** Press "/" anywhere (outside a field) to jump to search. */
function SlashToSearch() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || /input|textarea|select/i.test(t.tagName) || t.isContentEditable) return;
      e.preventDefault();
      document.getElementById("admin-search")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
