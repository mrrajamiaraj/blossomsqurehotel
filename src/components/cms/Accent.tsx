import { Fragment } from "react";

/** Splits "Seafood from these shores, *breakfast on us.*" into text and italic accents. */
export function accentParts(text: string): { text: string; em: boolean }[] {
  return text
    .split(/(\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part) => (part.length > 2 && part.startsWith("*") && part.endsWith("*") ? { text: part.slice(1, -1), em: true } : { text: part, em: false }));
}

/** Renders a heading written with *asterisk* accents, the way the site's titles look. */
export default function Accent({ text }: { text: string }) {
  return (
    <>
      {accentParts(text).map((p, i) => (p.em ? <em key={i}>{p.text}</em> : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}

/** Plain text of an accented heading (for metadata and aria labels). */
export const plain = (text: string) => text.replace(/\*/g, "");
