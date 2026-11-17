import { Button } from "@/components/primitives/button";
import { HOTEL, RESERVATIONS, WHATSAPP } from "@/lib/hotel";
import { cn } from "@/lib/utils";
import { Chat, Mail, Phone } from "../icons";

/**
 * Click-to-call, WhatsApp and email, as one row of real links.
 * `message` pre-fills the WhatsApp chat (and the email subject).
 */
export default function ContactActions({
  message,
  onDark,
  className,
  email = true,
  size = "md",
}: {
  message?: string;
  onDark?: boolean;
  className?: string;
  email?: boolean;
  size?: "sm" | "md";
}) {
  const wa = message ? `${WHATSAPP.href}?text=${encodeURIComponent(message)}` : WHATSAPP.href;
  const mail = `mailto:${HOTEL.email}${message ? `?subject=${encodeURIComponent(message)}` : ""}`;
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Button asChild variant={onDark ? "light" : "primary"} size={size}>
        <a href={RESERVATIONS.href}>
          <Phone size={16} />
          <span>
            Call <span className="sr-only">the hotel on </span>
            <span className="hidden sm:inline">{RESERVATIONS.display}</span>
          </span>
        </a>
      </Button>
      <Button asChild variant={onDark ? "ghost-light" : "outline"} size={size}>
        <a href={wa} target="_blank" rel="noopener noreferrer">
          <Chat size={16} />
          WhatsApp
          <span className="sr-only"> (opens WhatsApp)</span>
        </a>
      </Button>
      {email && (
        <Button asChild variant={onDark ? "ghost-light" : "outline"} size={size}>
          <a href={mail}>
            <Mail size={16} />
            Email
          </a>
        </Button>
      )}
    </div>
  );
}
