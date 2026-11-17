"use client";

import Link from "next/link";
import Accordion from "@/components/ui/Accordion";
import type { Faq } from "@/lib/content/faq";
import { ArrowRight } from "../icons";

/** Questions as an accessible accordion; an answer may end with one link. */
export default function FaqList({ items, defaultOpen = null }: { items: Faq[]; defaultOpen?: number | null }) {
  return (
    <Accordion
      defaultOpen={defaultOpen}
      items={items.map((f) => ({
        title: f.q,
        body: (
          <>
            <p>{f.a}</p>
            {f.link && (
              <p className="mt-3">
                <Link href={f.link.href} className="link-line">
                  {f.link.label}
                  <ArrowRight />
                </Link>
              </p>
            )}
          </>
        ),
      }))}
    />
  );
}
