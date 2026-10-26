"use client";

import { useActionState, useState } from "react";
import { sendPasswordReset, signIn } from "@/app/admin/actions";

export default function LoginForms({ notice }: { notice?: string }) {
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [signInState, signInAction, signingIn] = useActionState(signIn, undefined);
  const [resetState, resetAction, resetting] = useActionState(sendPasswordReset, {});

  if (mode === "reset") {
    return (
      <form action={resetAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p className="a-muted">Enter your work email. If it has front-desk access, we&apos;ll send a link to set a new password.</p>
        <label className="a-field">
          <span className="a-label">Email</span>
          <input className="a-input" type="email" name="email" autoComplete="username" required autoFocus />
        </label>
        {resetState.error && (
          <p className="a-error" role="alert">
            {resetState.error}
          </p>
        )}
        {resetState.sent && <p role="status">Check your inbox for the link. It expires in an hour.</p>}
        <button type="submit" className="a-btn a-btn--primary a-btn--block" disabled={resetting} style={{ minHeight: 44 }}>
          {resetting && <span className="a-spin" aria-hidden="true" />}
          Send reset link
        </button>
        <button type="button" className="a-btn a-btn--ghost" onClick={() => setMode("signin")}>
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form action={signInAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {notice && (
        <p className="a-error" role="alert">
          {notice}
        </p>
      )}
      <label className="a-field">
        <span className="a-label">Email</span>
        <input className="a-input" type="email" name="email" autoComplete="username" required autoFocus />
      </label>
      <label className="a-field">
        <span className="a-label">Password</span>
        <input className="a-input" type="password" name="password" autoComplete="current-password" required />
      </label>
      {signInState?.error && (
        <p className="a-error" role="alert">
          {signInState.error}
        </p>
      )}
      <button type="submit" className="a-btn a-btn--primary a-btn--block" disabled={signingIn} style={{ minHeight: 44 }}>
        {signingIn && <span className="a-spin" aria-hidden="true" />}
        Sign in
      </button>
      <button type="button" className="a-btn a-btn--ghost" onClick={() => setMode("reset")}>
        Forgot password?
      </button>
    </form>
  );
}
