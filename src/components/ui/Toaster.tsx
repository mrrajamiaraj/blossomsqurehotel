"use client";

import { useEffect, useState } from "react";
import { Check } from "../icons";
import styles from "./Toaster.module.css";

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent("bsq:toast", { detail: message }));
}

/** One quiet confirmation at a time, bottom-centre. */
export default function Toaster() {
  const [message, setMessage] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let timer = 0;
    const onToast = (e: Event) => {
      setMessage((e as CustomEvent<string>).detail);
      setKey((k) => k + 1);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(null), 2600);
    };
    window.addEventListener("bsq:toast", onToast);
    return () => {
      window.removeEventListener("bsq:toast", onToast);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className={styles.region} role="status" aria-live="polite">
      {message && (
        <div key={key} className={styles.toast}>
          <Check size={16} />
          {message}
        </div>
      )}
    </div>
  );
}
