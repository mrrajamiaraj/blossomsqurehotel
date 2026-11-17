# Blossom Square — UI System

A quiet, boutique-luxury system: warm ivory grounds, charcoal type, champagne-gold
accents, with deep sea-pine as the brand anchor (logo, dark surfaces, primary
actions). Serif headlines, a readable sans for everything you read or tap,
generous space, hairline structure, and motion only where it means something.

**Living style guide:** `/design-system`. It always works in development. In
production it returns 404 unless `SHOW_DESIGN_SYSTEM=1`, and it is always `noindex`.

---

## 1. Tokens (`src/app/globals.css`)

| Role | Token | Day | Night |
| ---- | ----- | --- | ----- |
| Page ground | `--paper` | #f8f4ec | #0d1412 |
| Raised (cards, dialogs, inputs) | `--ivory` | #fffdf8 | #131b18 |
| Quiet fill / hover | `--sand`, `--sand-deep` | #f1eadc · #e6dac4 | #18221e · #202d28 |
| Text | `--ink` / `--ink-soft` / `--muted` | charcoal #1f1d1a · #48443e · #6b655c | #efe8da · #cbc5b8 · #9ea59f |
| Gold, decorative | `--champagne`, `--brass`, `--brass-light` | #c8ab74 · #b08f58 · #dcc79e | lighter |
| Gold, **text** | `--bronze` | #765a2c | #d6b77f |
| Brand / primary action | `--pine-800` | #0f3b2e | champagne #dcc79e |
| Dark surfaces | `--pine-900` | #0a2a21 | (same) |
| Error / success | `--rust` / `--success` | | |
| Focus ring | `--focus` | #8a6a35 | #dcc79e |
| Elevation | `--shadow-1…4` | warm, low and wide | deeper |
| Corners | `--radius-0/1/2` | 0 · 2px · 4px (pills only for chips) | |

Tailwind exposes them as `bg-paper`, `text-ink`, `text-bronze`, `bg-champagne`,
`border-line`, `shadow-sm`, plus the shadcn names (`bg-primary`, `text-muted-foreground`,
`border-input`, `ring`…), all mapped in `@theme inline`, so `dark:` and the
night theme follow automatically.

### Contrast rules (enforced by `tests/design-tokens.test.ts`, both themes)

- Body text is `--ink` on `--paper`/`--ivory`/`--sand` (≥ 7:1). Secondary text uses `--ink-soft` and captions `--muted` (≥ 4.5:1).
- **Gold at text sizes uses `--bronze`.** `--brass` and `--champagne` are for rules, icons, ornaments and display type of 24px or more.
- On `--pine-900` surfaces, use `--cream` text (≥ 7:1) and `--brass-light` accents (≥ 4.5:1). Add `data-surface="dark"` or `.on-dark` so focus rings turn light.
- Focus indicators keep ≥ 3:1 against every ground.

## 2. Typography

| Class | Face | Size (fluid) | Use |
| ----- | ---- | ------------ | --- |
| `.display` | Cormorant Garamond 400 | `--text-5xl` 3.1 → 7rem | Hero only |
| `.h1` | Cormorant 400 | `--text-4xl` 2.6 → 5rem | Page titles |
| `.h2` | Cormorant 400 | `--text-3xl` 2.05 → 3.5rem | Section titles |
| `.h3` / `.h4` | Cormorant 500 | 1.5 → 2rem / `--text-xl` | Card & sub-section titles |
| `.lede` | Inter | 1.05 → 1.2rem | Section openers |
| body | Inter 400, lh 1.65 | 16 → 17px | Everything read |
| `.caps`, `.eyebrow` | Inter 600, tracked 0.14em | 0.72rem | Labels, eyebrows |

- Put the accent phrase of a headline in `<em>`. It renders as the serif italic, champagne on dark grounds.
- Keep body copy within a `.measure` (66ch). Headlines use `text-wrap: balance`.
- Prices in serif use `<Money>` (see RoomCard). Cormorant has no ৳ glyph, so Money sets the symbol in Inter, with lining figures.
- Only the weights in use are loaded (Cormorant 400/500/600 plus italic; Inter is variable).

## 3. Space, grid, breakpoints

- **Spacing:** `--space-3xs … --space-2xl` (8-pt based; xl/2xl are fluid). Section rhythm is `--section`, side gutters are `--gutter`.
- **Grid:** `.layout-grid` has 4 columns, then 8 from 860px and 12 from 1180px, with `--grid-gap`. Content max-width is `--max` (1440px).
- **Breakpoints** (CSS and Tailwind agree): `sm` 640 · `md` 860 (tablet; the nav collapses) · `lg` 1180 (desktop nav) · `xl` 1440.

## 4. Components

### Primitives: `src/components/primitives/` (shadcn/ui, restyled)

| File | Exports |
| ---- | ------- |
| `button.tsx` | `Button` (primary · gold · outline · light · ghost-light · ghost · destructive · link; sm/md/lg/icon; `loading`, `asChild`, `block`), `Spinner` |
| `field.tsx` | `Field`, `FieldLabel`, `FieldHint`, `FieldError`, `Label`, `Input`, `Textarea` (boxed · line) |
| `choice.tsx` | `Checkbox`, `CheckboxRow`, `RadioGroup`, `RadioGroupItem`, `RadioCard`, `Switch` |
| `menu.tsx` | `Select…`, `DropdownMenu…`, `Tabs…` |
| `overlay.tsx` | `Dialog…`, `Sheet…` (left/right/bottom), `Popover…`, `Tooltip` |
| `calendar.tsx` | `Calendar` (react-day-picker v10, Monday start, 44px days) |
| `surface.tsx` | `Badge`, `Card`, `CardBody`, `CardTitle`, `Separator` (with ornament), `Skeleton`, `LoadingRegion`, `EmptyState` |

### Hospitality: `src/components/system/`

`SectionHeading` · `RoomCard` (stacked/wide) + `RoomCardSkeleton` + `PriceTag` + `Money` ·
`AmenityCard` + `AmenityGrid` · `Gallery` + `Lightbox` (keyboard and swipe) ·
`TestimonialCard` · `DateRangeField` (popover on desktop, bottom sheet on phones).

### Feedback

- `toast(msg)` still works unchanged; it adds `toast.success / .error / .info`, with optional `description` and one `action`. Toasts stack (max 3), pause on hover or focus, and can be dismissed. Errors use `role="alert"`.
- Route `error.tsx` / `global-error.tsx` use `components/shell/ErrorState`. `loading.tsx` uses `PageLoading`.

### Admin kit: `src/components/admin/kit/` (inside `.admin`, on `admin.css` tokens)

`PageHeader` · `StatCard` + `StatGrid` (direction shown by arrow and text, never colour alone) ·
`Panel` · `Toolbar` · `AdminEmptyState` · `DataTable` (sortable, `aria-sort`, row
headers, stacks into cards under 760px) · `ConfirmDialog` (native `<dialog>`; the
safe choice comes first).

### Navigation and footer

- **Header:** transparent over the hero, then solid ivory with blur. It hides while you scroll down and returns on the way up. It has the serif wordmark, quick links with `aria-current`, the theme toggle, call, and Book.
- **Menu drawer:** focus trap, Escape and scrim to close, `inert` when closed. On touch you can swipe left to close. It includes Call and WhatsApp actions.
- **Footer:** address with directions, both phones, WhatsApp, email, payment methods (from `lib/hotel.ts`), check-in/out, explore links, social, and the staff login.

## 5. Motion

- Easing is `--ease-out` (cubic-bezier(.16,1,.3,1)), used everywhere. Durations: 0.2–0.35s for UI, 0.45–0.6s for overlays, 0.9–1.4s for editorial reveals.
- Only `transform` and `opacity` are animated (compositor-friendly). Nothing animates layout.
- Scroll reveals are the CSS `[data-reveal]` system, so content shows without JavaScript. Use Motion (`motion/react`) only for gesture or layout animation; `AppProviders` sets `reducedMotion="user"`.
- **Reduced motion:** the global rule collapses every animation and transition, reveals render in their final state, and the shimmer stops (`motion-safe:`).
- Hover effects are fenced with `@media (hover: hover)`, so touch devices never get "sticky" hovers.

## 6. Accessibility checklist (for every new component)

- [ ] Reachable and operable by keyboard, with a visible focus ring (`--focus`, ≥ 3:1)
- [ ] Touch targets ≥ 44 × 44px
- [ ] Names: a label, `aria-label`, or a visible heading; icons are `aria-hidden`
- [ ] State is exposed: `aria-current`, `aria-expanded`, `aria-sort`, `aria-invalid`, `aria-busy`
- [ ] Overlays: focus moves in, is trapped, and returns to the trigger; Escape closes
- [ ] Information never depends on colour alone
- [ ] Works at 320px wide with no horizontal scroll, and at 200% zoom
- [ ] Respects reduced motion

## 7. Content rules

- **Photography:** only the hotel's own photos (`public/photos/*`, or uploads in Supabase Storage). A missing photo shows the tonal placeholder plate, never a stock image.
- **Testimonials:** only real reviews, with the guest's words, name and source (and a link when public). The style guide's single specimen is labelled as such.
- **Facts** (address, phones, payment methods, check-in times) come from `lib/hotel.ts`. **Rooms and rates** come from the database.

## 8. Working with the system

- **Adding a shadcn component:** `npx shadcn@latest add <name>` installs to `components/primitives`. **Review the diff to `globals.css`** and revert any new `:root` variables, because the tokens are already mapped. Then restyle it to match (square corners, caps labels, 44px targets).
- **Unlayered brand CSS wins over Tailwind utilities.** Global classes such as `.photo { position: relative }` beat a `absolute` utility. Size and position photo frames with utilities that don't clash (`h-full w-full`, `aspect-*`).
- **Verification:** `npm test` runs the token contrast checks and the component behaviour tests (jsdom). `npm run verify` runs the typecheck, the tests and the build.

## 9. Known gaps / next phase

- Existing pages still use their CSS-module cards and buttons. Move them onto `RoomCard`, `Button`, `Field` and the rest page by page (home → rooms → booking).
- The booking flow's custom `DateRangePicker` can be replaced by `DateRangeField` after a flow review.
- The admin still uses Inter for the ৳ sign, which renders through a fallback font. Consider a `Money` variant there.
- Not yet added: a Content-Security-Policy and route-level view transitions (Next.js has them as an experimental flag).
