import Link from "next/link";
import { SITE_URL } from "@/lib/seo";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb trail with schema.org BreadcrumbList data. "Home" is added
 * automatically; the last crumb is the current page.
 */
export default function Breadcrumbs({ items, className, onDark }: { items: Crumb[]; className?: string; onDark?: boolean }) {
  const trail: Crumb[] = [{ label: "Home", href: "/" }, ...items];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: `${SITE_URL}${c.href}` } : {}),
    })),
  };
  return (
    <nav aria-label="Breadcrumb" className={cn("text-[0.8rem]", onDark ? "text-cream/80" : "text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={c.label + i} className="flex items-center gap-2.5">
              {i > 0 && (
                <span aria-hidden="true" className={onDark ? "text-brass-light" : "text-brass"}>
                  /
                </span>
              )}
              {last || !c.href ? (
                <span aria-current={last ? "page" : undefined} className={onDark ? "text-cream" : "text-ink"}>
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="inline-flex min-h-6 items-center underline-offset-4 hover:underline">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </nav>
  );
}
