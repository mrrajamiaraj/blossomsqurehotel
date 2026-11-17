import { cn } from "@/lib/utils";

type Props = {
  eyebrow?: string;
  /** Wrap the accent phrase in <em> for the italic serif. */
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: "start" | "center";
  as?: "h1" | "h2" | "h3";
  size?: "display" | "h1" | "h2" | "h3";
  action?: React.ReactNode;
  className?: string;
  /** Use on dark surfaces (cream text, light-gold eyebrow). */
  onDark?: boolean;
};

/** Eyebrow + serif headline + lede — the standard opening of every section. */
export default function SectionHeading({ eyebrow, title, lede, align = "start", as: Tag = "h2", size = "h2", action, className, onDark }: Props) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "flex flex-col gap-5",
        centered && "items-center text-center",
        action && !centered && "md:flex-row md:items-end md:justify-between md:gap-10",
        onDark && "on-dark",
        className,
      )}
    >
      <div className={cn("flex flex-col gap-5", centered && "items-center")}>
        {eyebrow && <p className="caps eyebrow">{eyebrow}</p>}
        <Tag className={cn(size, "max-w-[18ch]", centered && "mx-auto")}>{title}</Tag>
        {lede && <p className={cn("lede max-w-[56ch]", onDark && "text-[var(--mist)]")}>{lede}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
