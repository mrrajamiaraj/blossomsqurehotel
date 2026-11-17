import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verifies the contrast rules documented in globals.css against the actual
 * token values, for both the day and the night theme (WCAG 2.2):
 *   text ≥ 4.5:1 (7:1 for primary body text), UI/focus indicators ≥ 3:1.
 */

const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing ${selector}`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) vars[m[1]] = m[2].toLowerCase();
  return vars;
}

const light = block(":root");
const dark = { ...light, ...block('html[data-theme="dark"]') };

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

type Rule = [fg: string, bg: string, min: number, why: string];

const RULES: Rule[] = [
  ["ink", "paper", 7, "body text"],
  ["ink", "ivory", 7, "body text on cards"],
  ["ink", "sand", 7, "text on sand fills"],
  ["ink-soft", "paper", 4.5, "secondary text"],
  ["ink-soft", "ivory", 4.5, "secondary text on cards"],
  ["muted", "paper", 4.5, "captions"],
  ["muted", "ivory", 4.5, "captions on cards"],
  ["muted", "sand", 4.5, "captions on sand"],
  ["bronze", "paper", 4.5, "gold text"],
  ["bronze", "ivory", 4.5, "gold text on cards"],
  ["rust", "paper", 4.5, "error text"],
  ["focus", "paper", 3, "focus ring"],
  ["focus", "ivory", 3, "focus ring on cards"],
  ["focus", "sand", 3, "focus ring on sand"],
  ["paper", "pine-800", 4.5, "primary button label"],
];

describe.each([
  ["day theme", light],
  ["night theme", dark],
])("%s contrast", (_, t) => {
  it.each(RULES)("%s on %s ≥ %s:1 (%s)", (fg, bg, min) => {
    expect(t[fg], `--${fg} is a hex token`).toBeDefined();
    expect(t[bg], `--${bg} is a hex token`).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe("always-dark surfaces", () => {
  it("cream text on deep pine ≥ 7:1", () => expect(contrast(light.cream, light["pine-900"])).toBeGreaterThanOrEqual(7));
  it("light-gold accents on deep pine ≥ 4.5:1", () => expect(contrast(light["brass-light"], light["pine-900"])).toBeGreaterThanOrEqual(4.5));
  it("light-gold focus ring on deep pine ≥ 3:1", () => expect(contrast(light["brass-light"], light["pine-900"])).toBeGreaterThanOrEqual(3));
});
