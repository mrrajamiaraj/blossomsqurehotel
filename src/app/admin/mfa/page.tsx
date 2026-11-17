import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import MfaPanel from "@/components/admin/MfaPanel";
import { roleName } from "@/lib/access";
import { resolveAdmin } from "@/lib/admin/session";
import { getSessionClient } from "@/lib/supabase";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Two-step sign-in" };

/**
 * Second factor for staff. Owners, super admins, managers and finance must
 * complete it every session (the database refuses their permissions until
 * the session is aal2); other roles can set it up from their account.
 */
export default async function MfaPage() {
  const ctx = await resolveAdmin();
  if ("problem" in ctx) {
    if (ctx.problem === "not_configured") redirect("/admin/setup");
    if (ctx.problem === "signed_out") redirect("/admin/login");
    if (ctx.problem === "no_access") redirect("/admin/login?error=no_access");
  } else if (ctx.mode === "preview") {
    redirect("/admin");
  }

  const db = await getSessionClient();
  const [{ data: factors }, { data: level }] = await Promise.all([db.auth.mfa.listFactors(), db.auth.mfa.getAuthenticatorAssuranceLevel()]);
  const verified = factors?.totp?.[0] ?? null;
  const required = "problem" in ctx;
  const role = "problem" in ctx ? ctx.role : ctx.staff.role;

  return (
    <main id="main" className={styles.page}>
      <section className={styles.brandSide} aria-hidden="true">
        <Image src="/brand/crest.png" alt="" width={240} height={240} priority className={styles.crest} />
      </section>
      <section className={styles.formSide}>
        <div className={styles.card}>
          <p className="a-eyebrow">{role ? roleName(role) : "Front desk"}</p>
          <h1 className="a-title">Two-step sign-in</h1>
          <MfaPanel
            factorId={verified?.id ?? null}
            alreadyVerified={level?.currentLevel === "aal2"}
            required={required}
          />
        </div>
      </section>
    </main>
  );
}
