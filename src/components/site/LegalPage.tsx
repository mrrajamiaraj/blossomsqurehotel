import PageHero from "./PageHero";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

/** Long-form policy page: plain hero, a sticky table of contents, readable measure. */
export default function LegalPage({ title, lede, updated, sections, crumb }: { title: React.ReactNode; lede: string; updated: string; sections: LegalSection[]; crumb: string }) {
  return (
    <>
      <PageHero eyebrow={`Last updated ${updated}`} title={title} lede={lede} crumbs={[{ label: crumb }]} />
      <div className="section pt-[clamp(48px,6vw,88px)]">
        <div className="wrap grid gap-14 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-24">
          <nav aria-label="On this page" className="h-fit lg:sticky lg:top-[calc(var(--header-h)+24px)]">
            <p className="caps text-bronze">On this page</p>
            <ol className="mt-4 flex flex-col border-l border-line">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px flex min-h-11 items-center gap-3 border-l border-transparent py-1.5 pl-4 text-sm text-ink-soft hover:border-brass hover:text-ink">
                    <span className="text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="measure flex flex-col gap-14">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-[calc(var(--header-h)+24px)]">
                <h2 id={`${s.id}-h`} className="h3 flex items-baseline gap-4">
                  <span className="font-sans text-sm text-brass tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                <div className="mt-5 flex flex-col gap-4 text-[1.02rem] leading-[1.75] text-ink-soft [&_a]:text-link [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
