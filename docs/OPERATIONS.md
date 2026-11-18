# Content management & hotel operations

Everything hotel staff change day to day, without touching code. All of it is stored in Supabase; every change is checked twice — by the server action (permission, input) and again by a `security definer` database function (permission, rank, business rules) — and recorded in the audit log.

**Migration:** `supabase/migrations/20261118180000_cms_and_operations.sql` · **Rollback:** `supabase/rollbacks/20261118180000_cms_and_operations.down.sql` · release steps in [MIGRATION_AND_ROLLBACK.md](MIGRATION_AND_ROLLBACK.md) §E.

## Where things are (admin)

| Task | Screen | Permission | Steps |
| ---- | ------ | ---------- | ----- |
| Change homepage text or hero photo | Website content → Homepage | `content.manage` | edit → **Publish** → confirm |
| Try changes before visitors see them | any section → **Save draft** → **Preview** | `content.manage` | 2 |
| Undo a published change | section → **History** → *Use as draft* → Publish | `content.manage` | 3 |
| Upload / replace / delete photos | Media | `content.manage` | 1–2 |
| Room description, beds, occupancy, amenities, price | Rooms → room type | `rooms.manage` | edit → Save |
| Room gallery order | Rooms → room type → Photos (earlier / later) | `rooms.manage` | 1 per move |
| Add a room number | Rooms → Add room | `rooms.manage` | 2 |
| Seasonal rate | Rooms → room type → Seasons | `rates.manage` | 2 |
| Maintenance block | Rooms → room type → room → Maintenance block | `maintenance.manage` | dates + reason → Block |
| Mark a room cleaning / clean / inspected | Housekeeping → room card | `housekeeping.write` | 1 |
| Start / finish a task | Housekeeping → Tasks → Start / Done | `housekeeping.write` | 1 each |
| Report a repair | Housekeeping → room → Report a problem | `housekeeping.write` | 2 |
| Assign tasks | Housekeeping → Tasks → assignee | desk or maintenance manager | 1 |
| Offer / promo code | Offers → New offer | `promotions.manage` | fill → Save |
| Invite / change role / remove access | Team | `staff.manage` | 1–2 |
| Who changed what | Activity log | `audit.read` | — |

Every action ends in a confirmation toast or a plain-language error (`src/lib/data/errors.ts` maps each database code). Destructive actions ask first.

## Website content (CMS)

- **Editable sections** (`src/lib/cms/sections.ts`): homepage (headings, hero photograph, introduction, amenities, dining and events stories), about, dining, meetings & events, facilities, FAQ, offers page, contact details, booking policies, footer, and SEO (title, description and share image per page). Room descriptions and galleries are edited under Rooms.
- **Built-in text:** each section ships with its current wording. A field an editor leaves blank falls back to it, so the site never shows an empty heading.
- **Draft → publish:** drafts live in `site_content.draft_*`, which visitors can't read (RLS plus column grants). Preview uses Next draft mode for the signed-in editor only. Publishing copies the draft to `body`, bumps `version` and keeps a copy in `site_content_versions`.
- **Two editors at once:** saves carry the draft stamp they started from. A colleague's newer draft gives `CONTENT_CONFLICT`, and nothing is overwritten.
- **Validation** (`src/lib/cms/fields.ts`) runs on the server for every save:
  - text is trimmed and length-limited, and control characters are stripped;
  - links must be `https:` or a site path;
  - images must come from this project's Storage or `/photos/`;
  - unknown keys are dropped.

## Images

- **Optimised in the browser before upload** (`src/lib/cms/optimize.ts`): turned upright, longest side 2400 px, re-encoded as WebP (JPEG fallback). A 5–10 MB phone photo becomes about 200–600 KB. The server re-checks type and size; the bucket limits do too.
- **Buckets:**
  - `site-media`: website photos;
  - `room-photos`: room galleries.
  Both are public to read. Writes are limited by permission through storage policies.
- **Library** (`media_assets`): every upload is recorded with its alt text, size and dimensions.
- **Library actions:**
  - **Preview:** thumbnails in the library and picker.
  - **Reorder:** move earlier/later in galleries and image lists.
  - **Replace:** swaps the file everywhere it's used.
  - **Delete:** refused with `MEDIA_IN_USE` while a page or room still uses it. The usage list says where.

## Rooms

- **Room types:** name, description, bed type, size, max adults/children/occupancy, amenities and features, standard and weekend price, and photos.
- **New room types** start unpublished, with their standard rate plan created for them.
- **Room numbers:** unique, and the format is checked. A room that bookings need can't be removed.
- **Seasonal rates:** overlapping seasons are refused with `SEASON_OVERLAP`, which names the clash. Prices follow seasons night by night in `_quote`.
- **Maintenance blocks** (`room_blocks`, permission `maintenance.manage`) take the room out of inventory for those nights. A block is refused if a booking is assigned to that room (`ROOM_IN_USE`), if the hotel would no longer have enough rooms of that type for its reservations (`ROOM_NEEDED`), or if it overlaps another block (`BLOCK_OVERLAP`).

## Housekeeping

| Status | Set by |
| ------ | ------ |
| Dirty | staff, or automatically at check-out (a cleaning task is created too) |
| Cleaning | staff (starting a cleaning task sets it) |
| Clean | staff (finishing a cleaning task sets it) |
| Inspected | staff (finishing an inspection sets it) — ready to sell |
| Occupied | derived: a checked-in stay (shown unless the room is being cleaned) |
| Out of service | derived from the room's *out of service* switch (Rooms), with its note; overrides everything else |

Maintenance blocks and open repairs are shown on the room card ("Blocked for maintenance", "1 repair reported"); a block removes the room from sale for its dates.

- **What housekeepers see:** their own tasks plus unassigned ones (*Mine & unassigned*). They can start and finish those tasks and report repairs. The board shows arrivals and departures but **no guest details**.
- **Who assigns and cancels tasks:** only the desk (`bookings.write`) or a maintenance manager.
- **Repair reports** create a repair task (urgent ones get priority 1) and notify maintenance managers. They don't take the room out of service by themselves; a manager does that in Rooms, or adds a block, if the room can't be sold.

## Staff

- **Inviting:** managers invite by email. The Auth user is created with the server key. The staff row is written by `admin_upsert_staff` *as the signed-in manager*, so the database enforces rank.
- **No self-elevation:**
  - nobody can change their own role or access (`SELF_CHANGE`);
  - you can only appoint or change people **below** your own rank (`RANK`);
  - the last active owner can't be removed;
  - the `staff` table can't be written directly by anyone.
- **Removing access:** sets the account inactive, which the database honours at once, and bans the sign-in so open sessions end. Restoring access reverses both.
- **MFA:** owners, super admins, managers and finance must use an authenticator app (AAL2) before privileged functions run.

## Promotions

- **Discount types:** percentage (1–90%) or a fixed taka amount per stay.
- **Room-specific:** optional room-type list; none ticked means every type.
- **Date-limited:** stay nights (first–last night) and an optional booking window (bookable from/until). Only nights inside the range are discounted.
- **Automatic or code:** with no code the offer applies itself; codes are unique and case-insensitive.
- **Stacking:**
  - *combinable* offers add up;
  - any other offer stands alone;
  - the guest gets whichever allowed combination saves the most;
  - a code that isn't better than the automatic offer is reported, not silently swapped.
- **Caps:** per-offer maximum discount, and maximum uses (bookings that aren't cancelled, locked against races). The hotel-wide `max_discount_percent` (Settings) caps all offers together.
- **Recording and deleting:** every applied offer is stored on the booking (`booking_promotions`). Used offers can only be switched off, not deleted.

## Tests

| File | Covers |
| ---- | ------ |
| `tests/db/cms-operations.test.ts` | database rules for all of the above, per role (PGlite) |
| `tests/db/cms-rollback.test.ts` | rollback restores the previous schema and keeps data |
| `tests/db/rls.test.ts` | row-level security and rank rules for every role |
| `tests/cms.test.ts` | section definitions, validation, merging over built-in text |
| `tests/room-setup.test.ts` | adding, renaming and removing rooms; gallery order |
| `tests/staff-workflows.test.tsx` | the screens: housekeeping board, draft/preview/publish, offers, team — right action, right values, confirmations, errors, hidden controls |
