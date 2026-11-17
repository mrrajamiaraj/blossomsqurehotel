"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signOut } from "@/app/admin/actions";
import { getBrowserClient } from "@/lib/supabase/client";

type Enrolment = { factorId: string; qr: string; secret: string };

/**
 * TOTP (authenticator app) for Supabase Auth.
 *  - With a verified factor: enter the 6-digit code → the session becomes aal2.
 *  - Without one: enrol, scan the QR code, confirm with a code.
 * The browser client only talks to Supabase Auth here; it never touches data.
 */
export default function MfaPanel({ factorId, alreadyVerified, required }: { factorId: string | null; alreadyVerified: boolean; required: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [pending, start] = useTransition();
  const auth = getBrowserClient()?.auth;

  if (!auth) return <p className="a-error">Supabase isn&apos;t connected.</p>;
  if (alreadyVerified && factorId) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p className="a-muted">Two-step sign-in is on, and this session is verified.</p>
        <button type="button" className="a-btn a-btn--primary" onClick={() => router.replace("/admin")}>
          Continue to the front desk
        </button>
      </div>
    );
  }

  const done = () => {
    router.replace("/admin");
    router.refresh();
  };

  const verify = (id: string) =>
    start(async () => {
      setError(null);
      const clean = code.replace(/\D/g, "");
      if (clean.length !== 6) return setError("Enter the 6-digit code from your authenticator app.");
      const { error: err } = await auth.mfa.challengeAndVerify({ factorId: id, code: clean });
      if (err) return setError("That code didn't work. Codes change every 30 seconds — try the current one.");
      done();
    });

  const enrol = () =>
    start(async () => {
      setError(null);
      // Clear any half-finished enrolment first.
      const { data: list } = await auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.factor_type === "totp" && f.status !== "verified") await auth.mfa.unenroll({ factorId: f.id });
      const { data, error: err } = await auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
      if (err || !data) return setError("Couldn't start set-up. Refresh the page and try again.");
      setEnrolment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    });

  const codeField = (
    <label className="a-field">
      <span className="a-label">6-digit code</span>
      <input
        className="a-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "mfa-error" : undefined}
      />
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {factorId ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify(factorId);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <p className="a-muted">Open your authenticator app and enter the code for Blossom Square.</p>
          {codeField}
          <button type="submit" className="a-btn a-btn--primary" disabled={pending}>
            {pending && <span className="a-spin" aria-hidden="true" />}
            Verify
          </button>
        </form>
      ) : enrolment ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify(enrolment.factorId);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <p className="a-muted">Scan this with Google Authenticator, Microsoft Authenticator, 1Password or similar, then enter the code it shows.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from Supabase Auth */}
          <img src={enrolment.qr} alt="QR code to add Blossom Square to your authenticator app" width={180} height={180} style={{ background: "#fff", padding: 8, borderRadius: 4 }} />
          <details>
            <summary className="a-hint">Can&apos;t scan? Enter this key instead</summary>
            <code style={{ wordBreak: "break-all", fontSize: 13 }}>{enrolment.secret}</code>
          </details>
          {codeField}
          <button type="submit" className="a-btn a-btn--primary" disabled={pending}>
            {pending && <span className="a-spin" aria-hidden="true" />}
            Turn on two-step sign-in
          </button>
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="a-muted">
            {required
              ? "Your role can change money, prices or staff access, so it needs a second step: a code from an authenticator app on your phone. It takes about a minute to set up."
              : "Add a second step to your sign-in: a code from an authenticator app on your phone."}
          </p>
          <button type="button" className="a-btn a-btn--primary" onClick={enrol} disabled={pending}>
            {pending && <span className="a-spin" aria-hidden="true" />}
            Set up authenticator app
          </button>
        </div>
      )}
      {error && (
        <p id="mfa-error" className="a-error" role="alert">
          {error}
        </p>
      )}
      <form action={signOut}>
        <button type="submit" className="a-btn a-btn--ghost" style={{ width: "100%" }}>
          Sign out
        </button>
      </form>
    </div>
  );
}
