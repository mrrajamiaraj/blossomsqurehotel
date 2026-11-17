import Link from "next/link";
import { Button } from "@/components/primitives/button";
import { ArrowRight } from "../icons";
import ContactActions from "./ContactActions";

/**
 * Closing call to action for inner pages: book online, or speak to the
 * front desk. Light sand surface, so it reads apart from the dark footer
 * (which carries its own reservation invite) directly below it.
 */
export default function CtaBand({
  eyebrow = "Reservations",
  title = (
    <>
      Plan your stay <em>by the sea.</em>
    </>
  ),
  body = "Check live availability and send a booking request in a few minutes, or speak to our front desk.",
  bookHref = "/booking",
  bookLabel = "Check availability",
  message,
}: {
  eyebrow?: string;
  title?: React.ReactNode;
  body?: string;
  bookHref?: string;
  bookLabel?: string;
  message?: string;
}) {
  return (
    <section className="border-t border-line bg-sand py-[clamp(72px,9vw,128px)]" aria-labelledby="cta-title">
      <div className="wrap grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <p className="caps eyebrow" data-reveal="up">
            {eyebrow}
          </p>
          <h2 id="cta-title" className="h2 mt-5 max-w-[18ch] text-primary [&_em]:text-bronze" data-reveal="up">
            {title}
          </h2>
        </div>
        <div className="flex flex-col gap-7" data-reveal="up">
          <p className="max-w-[46ch] text-[1.05rem] leading-relaxed text-ink-soft">{body}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={bookHref}>
                {bookLabel}
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <ContactActions size="sm" email={false} message={message} />
        </div>
      </div>
    </section>
  );
}
