import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import styles from "../auth.module.css";

export const metadata: Metadata = { title: "Connect the database" };

/** Shown in production until Supabase is configured. Never shows sample data. */
export default async function SetupPage() {
  await connection();
  if (isSupabaseConfigured()) redirect("/admin");
  return (
    <main id="main" className={styles.page}>
      <section className={styles.brandSide} aria-hidden="true">
        <Image src="/brand/crest.png" alt="" width={240} height={240} priority className={styles.crest} />
      </section>
      <section className={styles.formSide}>
        <div className={styles.card}>
          <p className="a-eyebrow">Front desk</p>
          <h1 className="a-title">Connect the database</h1>
          <p>The front desk runs on Supabase, which isn&apos;t connected on this server yet.</p>
          <ol className={styles.steps}>
            <li>Create a Supabase project and run the files in <code>supabase/migrations</code>, in order.</li>
            <li>
              Set <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
              <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server, then redeploy.
            </li>
            <li>Create the first manager (see <code>README.md</code>) and sign in.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}
