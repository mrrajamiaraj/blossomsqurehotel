import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminEmptyState, PageHeader, Panel, StatCard, StatGrid } from "@/components/admin/kit";
import { Button, Spinner } from "@/components/primitives/button";
import { Badge, Card, CardBody, CardTitle, EmptyState, LoadingRegion, Separator, Skeleton } from "@/components/primitives/surface";
import AmenityCard, { AmenityGrid } from "@/components/system/AmenityCard";
import Gallery from "@/components/system/Gallery";
import RoomCard, { RoomCardSkeleton } from "@/components/system/RoomCard";
import SectionHeading from "@/components/system/SectionHeading";
import TestimonialCard from "@/components/system/TestimonialCard";
import { ArrowRight, Bed } from "@/components/icons";
import { HOTEL_AMENITIES } from "@/lib/amenities";
import { formatTaka, roomKind } from "@/lib/format";
import { getRooms } from "@/lib/rooms";
import { AdminDemo, FormsDemo, OverlaysDemo, TabsDemo, ToastDemo } from "./Demos";
import "@/app/admin/admin.css";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/** Living style guide. Hidden in production unless SHOW_DESIGN_SYSTEM=1. */
function enabled() {
  return process.env.NODE_ENV !== "production" || process.env.SHOW_DESIGN_SYSTEM === "1";
}

const SWATCHES: { name: string; token: string; role: string; dark?: boolean }[] = [
  { name: "Ivory", token: "--paper", role: "Page ground" },
  { name: "Ivory raised", token: "--ivory", role: "Cards, dialogs, inputs" },
  { name: "Sand", token: "--sand", role: "Quiet fills, hover" },
  { name: "Charcoal", token: "--ink", role: "Headlines & body", dark: true },
  { name: "Charcoal soft", token: "--ink-soft", role: "Secondary text", dark: true },
  { name: "Muted", token: "--muted", role: "Captions (≥ 4.5:1)", dark: true },
  { name: "Champagne", token: "--champagne", role: "Ornament, large accents" },
  { name: "Brass", token: "--brass", role: "Rules, icons" },
  { name: "Bronze", token: "--bronze", role: "Gold text (≥ 4.5:1)", dark: true },
  { name: "Sea-pine", token: "--pine-800", role: "Brand · primary action", dark: true },
  { name: "Deep pine", token: "--pine-900", role: "Dark surfaces", dark: true },
  { name: "Rust", token: "--rust", role: "Errors", dark: true },
];

const SPECIMEN_ROWS = [
  { ref: "SPEC-001", guest: "Specimen Guest A", room: "Deluxe Couple", nights: 2, total: 10000 },
  { ref: "SPEC-002", guest: "Specimen Guest B", room: "Connecting King Suite", nights: 3, total: 37500 },
  { ref: "SPEC-003", guest: "Specimen Guest C", room: "Premium Twin", nights: 1, total: 4500 },
];

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-28 border-t border-line py-16 md:py-24">
      <div className="mb-10 flex flex-col gap-3">
        <p className="caps eyebrow">{eyebrow}</p>
        <h2 id={`${id}-h`} className="h2">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export default async function DesignSystemPage() {
  if (!enabled()) notFound();
  const rooms = await getRooms();
  // Only the hotel's own photographs that exist on disk (no placeholders, no stock).
  const gallery = rooms
    .flatMap((r) => r.gallery)
    .filter((p, i, all) => p.src && all.findIndex((q) => q.ref === p.ref) === i);

  return (
    <div className="wrap pt-[calc(var(--header-h)+48px)] pb-24">
      <SectionHeading
        as="h1"
        size="h1"
        eyebrow="Blossom Square · UI system"
        title={
          <>
            Quiet luxury, <em>built to last.</em>
          </>
        }
        lede="Tokens, typography, components and patterns for the guest site and the front desk. Every component here is keyboard-navigable, responsive and respects reduced motion."
      />

      <nav aria-label="Sections" className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {["colour", "type", "layout", "buttons", "forms", "overlays", "cards", "feedback", "admin"].map((s) => (
          <a key={s} href={`#${s}`} className="text-link capitalize text-ink-soft">
            {s}
          </a>
        ))}
      </nav>

      <Section id="colour" eyebrow="01 · Colour" title="Warm ivory, charcoal, champagne">
        <ul role="list" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {SWATCHES.map((s) => (
            <li key={s.token} className="flex flex-col gap-3">
              <span className="h-24 border border-line shadow-xs" style={{ background: `var(${s.token})` }} />
              <span>
                <span className="block font-medium">{s.name}</span>
                <code className="block text-xs text-muted-foreground">{s.token}</code>
                <span className="block text-xs text-muted-foreground">{s.role}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card>
            <CardBody>
              <CardTitle>Contrast rules</CardTitle>
              <ul className="list-disc space-y-1 pl-5 text-ink-soft">
                <li>Body copy: charcoal on ivory, never lighter than <code>--muted</code>.</li>
                <li>Gold at text sizes uses <code>--bronze</code>; <code>--brass</code>/<code>--champagne</code> are for rules, icons and display type.</li>
                <li>On deep-pine surfaces: cream text, light-gold accents.</li>
                <li>Focus ring <code>--focus</code> holds ≥ 3:1 on every ground. All checked by unit test.</li>
              </ul>
            </CardBody>
          </Card>
          <div data-surface="dark" className="on-dark flex flex-col justify-center gap-3 bg-pine p-8">
            <p className="caps eyebrow">On dark</p>
            <p className="h3">
              The sea is <em>a short walk</em> away.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="gold">Reserve</Button>
              <Button variant="ghost-light">View rooms</Button>
            </div>
          </div>
        </div>
      </Section>

      <Section id="type" eyebrow="02 · Typography" title="Cormorant Garamond & Inter">
        <div className="flex flex-col gap-8">
          <p className="display">
            Wake to the <em>Bay of Bengal</em>
          </p>
          <p className="h1">
            Rooms &amp; <em>suites</em>
          </p>
          <p className="h2">
            Breakfast by the <em>sea</em>
          </p>
          <p className="h3">Connecting King Suite</p>
          <p className="h4">Serif heading 4</p>
          <p className="lede measure">Lede — Inter at a relaxed measure for the opening paragraph of a section. It sets up the page without competing with the headline.</p>
          <p className="measure text-ink-soft">
            Body — Inter 16–17px, line-height 1.65. Line length is held near 66 characters for comfortable reading on every screen.
          </p>
          <div className="flex flex-wrap items-center gap-8">
            <p className="caps eyebrow">Eyebrow caps</p>
            <p className="caps text-bronze">Caption caps</p>
            <a href="#type" className="link-line">
              Drawn link <ArrowRight />
            </a>
            <a href="#type" className="text-link">
              Inline link
            </a>
          </div>
        </div>
      </Section>

      <Section id="layout" eyebrow="03 · Space & grid" title="Generous, consistent rhythm">
        <div className="layout-grid" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={`h-16 bg-sand ${i >= 4 ? "hidden md:block" : ""} ${i >= 8 ? "md:hidden lg:block" : ""}`} />
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">4 columns on phones · 8 from 860px · 12 from 1180px · max content 1440px · fluid gutters.</p>
        <div className="mt-8 flex flex-wrap items-end gap-4">
          {["3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl"].map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <span className="block bg-brass/70" style={{ width: `var(--space-${s})`, height: `var(--space-${s})` }} />
              <code className="text-xs text-muted-foreground">{s}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" eyebrow="04 · Actions" title="Buttons">
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center gap-4">
            <Button>Reserve your stay</Button>
            <Button variant="outline">View details</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Text link</Button>
            <Button variant="destructive">Cancel booking</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">
              Large <ArrowRight />
            </Button>
            <Button size="icon" variant="outline" aria-label="Rooms">
              <Bed />
            </Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section id="forms" eyebrow="05 · Forms" title="Inputs, choices & dates">
        <FormsDemo rooms={rooms.map((r) => ({ slug: r.slug, name: r.name, price: r.price_bdt }))} />
      </Section>

      <Section id="overlays" eyebrow="06 · Overlays" title="Dialogs, sheets, menus">
        <OverlaysDemo />
        <div className="mt-12">
          <TabsDemo />
        </div>
      </Section>

      <Section id="cards" eyebrow="07 · Hospitality" title="Rooms, amenities, galleries">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {rooms.slice(0, 3).map((r, i) => (
            <RoomCard
              key={r.slug}
              href={`/rooms/${r.slug}`}
              bookHref={`/booking?room=${r.slug}`}
              name={r.name}
              kind={roomKind(r.tag)}
              photo={r.gallery[0] ?? { ref: r.slug, alt: r.name, src: null, tone: "forest" }}
              facts={[r.bed, `Sleeps ${r.sleeps}`, r.view && `${r.view} view`].filter(Boolean) as string[]}
              blurb={r.blurb}
              priceBdt={r.price_bdt}
              wasBdt={r.rack_price_bdt}
              priceNote={r.weekend_price_bdt ? `${formatTaka(r.weekend_price_bdt)} Thu & Fri` : undefined}
              badge={i === 0 ? "Most requested" : undefined}
              priority={i === 0}
            />
          ))}
        </div>
        {rooms[3] && (
          <div className="mt-6">
            <RoomCard
              layout="wide"
              href={`/rooms/${rooms[3].slug}`}
              bookHref={`/booking?room=${rooms[3].slug}`}
              name={rooms[3].name}
              kind={roomKind(rooms[3].tag)}
              photo={rooms[3].gallery[0] ?? { ref: rooms[3].slug, alt: rooms[3].name, src: null, tone: "sea" }}
              facts={[rooms[3].bed, `Sleeps ${rooms[3].sleeps}`]}
              blurb={rooms[3].description}
              priceBdt={rooms[3].price_bdt}
            />
          </div>
        )}

        <Separator ornament className="my-16" />
        <AmenityGrid>
          {HOTEL_AMENITIES.slice(0, 8).map((a) => (
            <AmenityCard key={a.name} icon={a.icon} name={a.name} note={a.note} />
          ))}
        </AmenityGrid>

        <Separator ornament className="my-16" />
        <Gallery photos={gallery} title="Blossom Square — photographs" />

        <Separator ornament className="my-16" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Badge tone="outline" className="self-start whitespace-normal">
              Specimen — replace with a verified guest review
            </Badge>
            <TestimonialCard
              t={{
                quote: "Specimen text. Testimonials appear only with a real guest's words, name and the source they were published on.",
                author: "Guest name",
                detail: "Home city",
                source: "Source (e.g. Google review)",
              }}
            />
          </div>
          <div className="flex flex-wrap content-start gap-3">
            <Badge>Neutral</Badge>
            <Badge tone="gold">Breakfast included</Badge>
            <Badge tone="pine">Suite</Badge>
            <Badge tone="outline">Sea view</Badge>
            <Badge tone="success">Available</Badge>
            <Badge tone="danger">Sold out</Badge>
          </div>
        </div>
      </Section>

      <Section id="feedback" eyebrow="08 · Feedback" title="Loading, empty, errors & toasts">
        <div className="grid gap-6 md:grid-cols-2">
          <LoadingRegion label="Loading rooms">
            <RoomCardSkeleton />
          </LoadingRegion>
          <div className="flex flex-col gap-6">
            <EmptyState
              icon={<Bed />}
              title="No rooms for those dates"
              description="Every room is taken on at least one night. Try moving your stay by a day, or call us — we sometimes have late cancellations."
              action={
                <Button variant="outline" size="sm">
                  Change dates
                </Button>
              }
            />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <span className="flex items-center gap-3 text-sm text-muted-foreground">
                <Spinner /> Checking availability…
              </span>
            </div>
            <ToastDemo />
          </div>
        </div>
      </Section>

      <Section id="admin" eyebrow="09 · Front desk" title="Admin components">
        <div className="admin rounded-[var(--radius-2)] border border-line p-5 sm:p-8" style={{ minHeight: 0 }}>
          <PageHeader
            eyebrow="Thursday 20 November"
            title="Today"
            description="Arrivals, departures and rooms to turn."
            actions={
              <>
                <button type="button" className="a-btn">
                  Print
                </button>
                <button type="button" className="a-btn a-btn--primary">
                  New booking
                </button>
              </>
            }
          />
          <StatGrid label="Specimen figures">
            <StatCard label="Occupancy" value="78%" delta={{ value: "+6 pts", direction: "up", good: true }} hint="vs last week" />
            <StatCard label="Arrivals" value="9" hint="3 still to confirm" href="#admin" />
            <StatCard label="ADR" value={formatTaka(7840)} delta={{ value: "−3%", direction: "down", good: false }} />
            <StatCard label="Rooms to clean" value="4" delta={{ value: "0", direction: "flat" }} />
          </StatGrid>
          <div className="mt-6 grid gap-6">
            <Panel title="Specimen bookings" id="spec" flush>
              <div className="p-5">
                <AdminDemo rows={SPECIMEN_ROWS} />
              </div>
            </Panel>
            <Panel title="Empty state">
              <AdminEmptyState title="No departures today">Rooms due out will appear here at midnight.</AdminEmptyState>
            </Panel>
          </div>
        </div>
      </Section>
    </div>
  );
}
