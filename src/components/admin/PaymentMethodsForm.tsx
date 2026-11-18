"use client";

import { useState, useTransition } from "react";
import { setPaymentMethods } from "@/app/admin/payments";
import { METHODS, type MethodId } from "@/lib/payments/methods";
import { toast } from "../ui/Toaster";

const KIND: Record<string, string> = { desk: "At the desk", transfer: "Guest sends money, staff verify", gateway: "Online gateway" };

/** Which ways to pay the website offers. Gateways also need server credentials. */
export default function PaymentMethodsForm({ initial, configured, live }: { initial: string[]; configured: string[]; live: boolean }) {
  const [on, setOn] = useState<Set<string>>(new Set(initial));
  const [pending, start] = useTransition();
  const dirty = [...on].sort().join() !== [...initial].sort().join();

  const toggle = (id: MethodId) => setOn((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <section className="a-panel" id="payments" aria-labelledby="pm-h">
      <div className="a-panel-head">
        <h2 id="pm-h" className="a-h2">
          Ways to pay
        </h2>
        <span className="a-hint">Shown to guests on their booking page.</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await setPaymentMethods([...on]);
            if (r.ok) toast.success(r.message);
            else toast.error(r.message);
          });
        }}
      >
        <fieldset disabled={!live || pending} style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="sr-only">Payment methods offered</legend>
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {METHODS.map((m) => {
              const ready = m.kind !== "gateway" || configured.includes(m.id);
              return (
                <li key={m.id} style={{ padding: "12px 20px", borderTop: "1px solid var(--a-line)" }}>
                  <label className="a-check" style={{ alignItems: "flex-start" }}>
                    <input type="checkbox" checked={on.has(m.id)} onChange={() => toggle(m.id)} aria-describedby={`pm-${m.id}`} />
                    <span>
                      <strong>{m.label}</strong> <span className="a-hint">· {KIND[m.kind]}</span>
                      {!ready && (
                        <span className="a-badge" data-s="checked_out" style={{ marginLeft: 6 }}>
                          Not set up
                        </span>
                      )}
                      <span id={`pm-${m.id}`} className="a-hint" style={{ display: "block" }}>
                        {!ready
                          ? "Guests see it as “not available yet” until the merchant account is connected on the server."
                          : m.account
                            ? m.account.map((a) => `${a.label}: ${a.value}`).join(" · ")
                            : m.guide}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="a-dialog-foot">
          {!live && <span className="a-hint">Needs Supabase.</span>}
          <button type="submit" className="a-btn a-btn--primary" disabled={!live || pending || !dirty || on.size === 0}>
            {pending && <span className="a-spin" aria-hidden="true" />}
            Save ways to pay
          </button>
        </div>
      </form>
    </section>
  );
}
