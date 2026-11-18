"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { runMessageQueue } from "@/app/admin/payments";
import { toast } from "../ui/Toaster";

/** Sends what's due now, instead of waiting for the next scheduled sweep. */
export default function RunQueueButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="a-btn"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const r = await runMessageQueue();
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
          router.refresh();
        })
      }
    >
      {pending && <span className="a-spin" aria-hidden="true" />}
      Send queued now
    </button>
  );
}
