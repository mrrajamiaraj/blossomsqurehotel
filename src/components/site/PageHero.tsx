import Parallax from "@/components/motion/Parallax";
import PhotoFrame from "@/components/ui/PhotoFrame";
import type { Photo } from "@/lib/photos";
import { cn } from "@/lib/utils";
import Breadcrumbs, { type Crumb } from "./Breadcrumbs";

type Props = {
  eyebrow: string;
  /** Wrap the accent phrase in <em>. */
  title: React.ReactNode;
  lede?: React.ReactNode;
  crumbs: Crumb[];
  /** A real hotel photograph. Without one (or without its file) the hero is typographic. */
  photo?: Photo | null;
  actions?: React.ReactNode;
  /** Extra content under the lede (e.g. quick facts). */
  children?: React.ReactNode;
};

const d = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/**
 * Opening of every inner page. With a photograph: full-bleed image, dark
 * shade, cream type (the header turns transparent over it — see
 * Header OVER_IMAGE). Without: an editorial ivory header. Never a stand-in image.
 */
export default function PageHero({ eyebrow, title, lede, crumbs, photo, actions, children }: Props) {
  const image = photo?.src ? photo : null;

  if (image) {
    return (
      <section className="relative isolate flex min-h-[78svh] items-end overflow-hidden bg-pine text-cream" aria-labelledby="page-title">
        <div className="absolute inset-0 -z-10">
          <Parallax speed={-0.08} className="absolute inset-[-8%_0]">
            <PhotoFrame photo={image} priority sizes="100vw" className="h-full w-full" />
          </Parallax>
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,29,23,0.55)_0%,rgba(7,29,23,0.15)_35%,rgba(7,29,23,0.78)_100%)]" />
        </div>
        <div className="wrap on-dark pt-[calc(var(--header-h)+48px)] pb-[clamp(48px,7vw,96px)]" data-surface="dark">
          <Breadcrumbs items={crumbs} onDark className="mb-10" />
          <p className="caps eyebrow" data-reveal="up">
            {eyebrow}
          </p>
          <h1 id="page-title" className="h1 mt-5 max-w-[16ch]" data-reveal="up" style={d(120)}>
            {title}
          </h1>
          {lede && (
            <p className="lede mt-6 max-w-[54ch] !text-[var(--mist)]" data-reveal="up" style={d(260)}>
              {lede}
            </p>
          )}
          {actions && (
            <div className="mt-9 flex flex-wrap gap-3" data-reveal="up" style={d(380)}>
              {actions}
            </div>
          )}
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-line pt-[calc(var(--header-h)+clamp(40px,6vw,88px))] pb-[clamp(48px,6vw,88px)]" aria-labelledby="page-title">
      <div className="wrap">
        <Breadcrumbs items={crumbs} className="mb-10" />
        <div className={cn("grid gap-x-[clamp(32px,6vw,96px)] gap-y-6", lede && "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end")}>
          <div>
            <p className="caps eyebrow" data-reveal="up">
              {eyebrow}
            </p>
            <h1 id="page-title" className="h1 mt-5 max-w-[16ch] text-primary [&_em]:text-bronze" data-reveal="up" style={d(120)}>
              {title}
            </h1>
          </div>
          {lede && (
            <div className="lg:pb-3" data-reveal="up" style={d(240)}>
              <p className="lede max-w-[50ch]">{lede}</p>
              {actions && <div className="mt-7 flex flex-wrap gap-3">{actions}</div>}
            </div>
          )}
        </div>
        {!lede && actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
        {children}
      </div>
    </section>
  );
}
