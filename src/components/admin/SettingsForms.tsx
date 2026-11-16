"use client";

import { useActionState, useState, useTransition } from "react";
import { inviteStaff, updatePassword, updateSettings, updateStaffMember } from "@/app/admin/actions";
import type { HotelSettings, StaffMember, StaffRole } from "@/lib/data/types";
import { priceBreakdown } from "@/lib/pricing";
import { formatTaka } from "@/lib/format";
import { toast } from "../ui/Toaster";

/* ---------------------------------------------------------- Policies */

export function PoliciesForm({ initial }: { initial: HotelSettings }) {
  const [s, setS] = useState({
    ...initial,
    vat: initial.vat_percent == null ? "" : String(initial.vat_percent),
    svc: initial.service_charge_percent == null ? "" : String(initial.service_charge_percent),
  });
  const [pending, start] = useTransition();
  const example = priceBreakdown(10000, {
    vat_percent: s.vat === "" ? null : Number(s.vat),
    service_charge_percent: s.svc === "" ? null : Number(s.svc),
  });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await updateSettings({
        cancellation_policy: s.cancellation_policy,
        children_policy: s.children_policy,
        confirm_call_within: s.confirm_call_within,
        vat_percent: s.vat === "" ? null : Number(s.vat),
        service_charge_percent: s.svc === "" ? null : Number(s.svc),
      });
      toast(res.ok ? (res.message ?? "Saved") : res.message);
    });
  };

  return (
    <form onSubmit={save} className="a-panel">
      <div className="a-panel-head">
        <h2 className="a-h2">Policies &amp; taxes</h2>
        <span className="a-hint">Shown to guests on room pages and at booking</span>
      </div>
      <fieldset disabled={pending} className="a-panel-body a-grid-2" style={{ border: 0, margin: 0 }}>
        <label className="a-field a-span-2">
          <span className="a-label">Cancellation policy</span>
          <textarea className="a-input" maxLength={600} value={s.cancellation_policy} onChange={(e) => setS({ ...s, cancellation_policy: e.target.value })} placeholder="e.g. Free cancellation up to 48 hours before arrival; after that, the first night is charged." />
          <span className="a-hint">Leave blank to hide it on the website.</span>
        </label>
        <label className="a-field a-span-2">
          <span className="a-label">Children &amp; extra beds</span>
          <textarea className="a-input" maxLength={600} value={s.children_policy} onChange={(e) => setS({ ...s, children_policy: e.target.value })} placeholder="e.g. Children under 6 stay free in the parents' bed. Extra bed ৳1,000 a night." />
          <span className="a-hint">Leave blank to hide it on the website.</span>
        </label>
        <label className="a-field">
          <span className="a-label">We call to confirm within</span>
          <input className="a-input" maxLength={40} value={s.confirm_call_within} onChange={(e) => setS({ ...s, confirm_call_within: e.target.value })} placeholder="e.g. 2 hours" />
          <span className="a-hint">Shown after a guest books: “…will call you within ___”. Blank shows “shortly”.</span>
        </label>
        <div className="a-grid-2" style={{ gap: 12 }}>
          <label className="a-field">
            <span className="a-label">Service charge %</span>
            <input className="a-input a-num" inputMode="decimal" value={s.svc} onChange={(e) => setS({ ...s, svc: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Not set" />
          </label>
          <label className="a-field">
            <span className="a-label">VAT %</span>
            <input className="a-input a-num" inputMode="decimal" value={s.vat} onChange={(e) => setS({ ...s, vat: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Not set" />
          </label>
        </div>
        <p className="a-span-2 a-hint" aria-live="polite">
          {example.taxesKnown
            ? `A ${formatTaka(10000)} stay becomes ${formatTaka(example.total)} (service ${formatTaka(example.service ?? 0)}, then VAT on room + service ${formatTaka(example.vat ?? 0)}).`
            : "Until both rates are set, guests see “VAT and service charge are added at check-in”."}
        </p>
      </fieldset>
      <div className="a-dialog-foot">
        <button type="submit" className="a-btn a-btn--primary" disabled={pending}>
          {pending && <span className="a-spin" aria-hidden="true" />}
          Save policies
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------- Team */

export function TeamPanel({ staff, selfId, live }: { staff: StaffMember[]; selfId: string; live: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("front_desk");
  const [pending, start] = useTransition();

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await inviteStaff(email, name, role);
      toast(res.ok ? (res.message ?? "Invited") : res.message);
      if (res.ok) {
        setEmail("");
        setName("");
      }
    });
  };

  const change = (id: string, patch: { role?: StaffRole; active?: boolean }) =>
    start(async () => {
      const res = await updateStaffMember(id, patch);
      toast(res.ok ? (res.message ?? "Saved") : res.message);
    });

  return (
    <section className="a-panel">
      <div className="a-panel-head">
        <h2 className="a-h2">
          Team<span className="a-count">{staff.length}</span>
        </h2>
        <span className="a-hint">Managers change rates, rooms and policies. Front desk handles bookings and housekeeping.</span>
      </div>
      <div className="a-table-wrap">
        <table className="a-table a-table--stack">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((m) => {
              const self = m.user_id === selfId;
              return (
                <tr key={m.user_id}>
                  <td data-label="">
                    <span className="a-primary-cell">
                      <strong>
                        {m.full_name}
                        {self ? " (you)" : ""}
                      </strong>
                      {m.email && <span>{m.email}</span>}
                    </span>
                  </td>
                  <td data-label="Role">
                    <select
                      className="a-input"
                      style={{ minHeight: 32, width: "auto" }}
                      value={m.role}
                      disabled={self || pending || !live}
                      onChange={(e) => change(m.user_id, { role: e.target.value as StaffRole })}
                      aria-label={`Role for ${m.full_name}`}
                    >
                      <option value="manager">Manager</option>
                      <option value="front_desk">Front desk</option>
                    </select>
                  </td>
                  <td data-label="Access">
                    {self ? (
                      <span className="a-muted">Active</span>
                    ) : (
                      <button
                        type="button"
                        className={`a-btn a-btn--sm ${m.active ? "a-btn--danger" : ""}`}
                        disabled={pending || !live}
                        onClick={() => change(m.user_id, { active: !m.active })}
                      >
                        {m.active ? "Revoke access" : "Restore access"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <form onSubmit={invite} style={{ borderTop: "1px solid var(--a-line)" }}>
        <fieldset disabled={pending || !live} className="a-panel-body" style={{ border: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 12, alignItems: "end" }}>
          <label className="a-field">
            <span className="a-label">Name</span>
            <input className="a-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label className="a-field">
            <span className="a-label">Email</span>
            <input className="a-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="a-field">
            <span className="a-label">Role</span>
            <select className="a-input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              <option value="front_desk">Front desk</option>
              <option value="manager">Manager</option>
            </select>
          </label>
          <button type="submit" className="a-btn a-btn--primary">
            {pending && <span className="a-spin" aria-hidden="true" />}
            Send invitation
          </button>
        </fieldset>
        {!live && (
          <p className="a-hint" style={{ padding: "0 20px 16px" }}>
            Team management needs Supabase. In preview the team is fixed.
          </p>
        )}
      </form>
    </section>
  );
}

/* ---------------------------------------------------------- Password */

export function PasswordForm({ live }: { live: boolean }) {
  const [state, action, pending] = useActionState(updatePassword, {});
  return (
    <form action={action} className="a-panel" style={{ maxWidth: 520 }}>
      <div className="a-panel-head">
        <h2 className="a-h2">Change password</h2>
      </div>
      <fieldset disabled={pending || !live} className="a-panel-body" style={{ border: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <label className="a-field">
          <span className="a-label">New password</span>
          <input className="a-input" type="password" name="password" autoComplete="new-password" minLength={10} required />
          <span className="a-hint">At least 10 characters. A short phrase is easier to remember.</span>
        </label>
        <label className="a-field">
          <span className="a-label">Repeat it</span>
          <input className="a-input" type="password" name="confirm" autoComplete="new-password" minLength={10} required />
        </label>
        {state.error && (
          <p className="a-error" role="alert">
            {state.error}
          </p>
        )}
        {state.done && <p role="status">Password updated.</p>}
        {!live && <p className="a-hint">Passwords are managed by Supabase once it&apos;s connected.</p>}
      </fieldset>
      <div className="a-dialog-foot">
        <button type="submit" className="a-btn a-btn--primary" disabled={pending || !live}>
          {pending && <span className="a-spin" aria-hidden="true" />}
          Update password
        </button>
      </div>
    </form>
  );
}
