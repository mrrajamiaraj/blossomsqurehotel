import { Fragment } from "react";

/**
 * Splits a headline into masked words for the [data-reveal="words"]
 * animation. Wrap words in *asterisks* to set them in italic.
 */
export default function SplitWords({ text, start = 0 }: { text: string; start?: number }) {
  let index = start;
  const segments = text.split("*");

  return (
    <>
      {segments.map((segment, s) => {
        const italic = s % 2 === 1;
        const words = segment.split(/(\s+)/).filter(Boolean);
        const content = words.map((word, w) => {
          if (/^\s+$/.test(word)) return <Fragment key={w}> </Fragment>;
          const i = index++;
          return (
            <span key={w} className="w">
              <span className="wi" style={{ "--i": i } as React.CSSProperties}>
                {word}
              </span>
            </span>
          );
        });
        return italic ? <em key={s}>{content}</em> : <Fragment key={s}>{content}</Fragment>;
      })}
    </>
  );
}
