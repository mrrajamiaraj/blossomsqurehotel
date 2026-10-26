import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import LoginForms from "@/components/admin/LoginForms";
import { resolveAdmin } from "@/lib/admin/session";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  no_access: "Your account isn't set up for the front desk. Ask a manager to add you.",
  link: "That link has expired or was already used. Request a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await resolveAdmin();
  if ("staff" in ctx) redirect("/admin");
  if ("problem" in ctx && ctx.problem === "not_configured") redirect("/admin/setup");
  const { error } = await searchParams;

  return (
    <main id="main" className={styles.page}>
      <section className={styles.brandSide} aria-hidden="true">
        <Image src="/brand/crest.png" alt="" width={240} height={240} priority className={styles.crest} />
      </section>
      <section className={styles.formSide}>
        <div className={styles.card}>
          <p className="a-eyebrow">Blossom Square</p>
          <h1 className="a-title">Front desk</h1>
          <LoginForms notice={error ? NOTICES[error] : undefined} />
        </div>
      </section>
    </main>
  );
}
