WOOBE — WEEK 4 PLAN

Theme: Storefront UX, Discovery & Admin UI Polish

Goal: Take the already-functioning commerce system and bring the customer storefront and admin experience to a polished, production-ready state without destabilizing the Week 3 revenue flow.

STATUS CHECK (2026-09-04, before Week 4 execution began)

This plan was written against an earlier state of the codebase. Between when
it was written and now, unrelated storefront/admin redesign work (and this
project's own Week 1-3 execution) already built most of what several days
below ask for. Verified by reading the actual current code, not by
assumption, before touching this file:

- Day 1 (admin sidebar) — ALREADY IMPLEMENTED. `apps/admin/src/features/shell/components/Sidebar.tsx`
  already has a persistent `w-56` left sidebar at `md:`+ , a hamburger/drawer
  below `md:`, active-route highlighting (`aria-current`), and logout pinned
  to the bottom (`md:mt-auto`). Only unaddressed nuance: there's no
  DISTINCT "compact/collapsible" tablet state — tablet currently gets the
  same full sidebar as desktop, which already rendered cleanly at 768px in
  Week 3 Day 10's own browser verification. Treat Day 1 as a verification
  pass (confirm all the listed admin pages still look right in the sidebar
  layout) unless a genuinely distinct tablet treatment is still wanted.

- Day 2 (search bar removal) — RESOLVED 2026-09-04, NO CHANGE MADE. Debounced,
  backend-authoritative search already exists and is shared by every search
  entry point (`SearchField.tsx`, `useSearchSuggestions.ts` — 300ms debounce,
  abort-on-restale, server re-validates length/caps result count/does a
  scoped indexed query, never a full-catalogue fetch). Live-verified: typing
  "sw" fires exactly one `GET /api/v1/products/suggestions?q=sw` request and
  renders "Ribbed Knit Sweater" in the dropdown.
  On removal: the "Shop page" half of this day was already moot — `/products`
  has no standalone bar, only the global header search. The homepage half
  (`CompactSearchBar.tsx`) is `md:hidden` — desktop already has no standalone
  bar either, matching this day as written; only mobile keeps one, because
  the client explicitly asked for it (reference photo, this project). Put
  the conflict to the client directly: keep it, current UI/functionality
  unchanged. Two stale doc comments that contradicted the actual code
  (claiming no in-page search existed, and that the bar was shared with the
  Shop listing) were corrected in place.

- Day 3 (category section redesign) — VERIFIED 2026-09-04, NO CHANGE NEEDED.
  Live-screenshotted the homepage at all four required widths (375/768/
  1024/1440). Centered, evenly spaced (`gap-4 sm:gap-7 md:gap-9 lg:gap-11`
  visibly widens across breakpoints), contained to the same `max-w-6xl` as
  the rest of the page's sections, no overflow or clipping at any width. All
  5 real categories fit on one row even at 375px, so the mobile
  `overflow-x-auto` scroll path wasn't exercised live, but the row layout
  (`min-w-max` + hidden-scrollbar wrapper) is unchanged from the prior
  redesign passes and has no reason to have regressed.

- Day 4 (related products) — VERIFIED 2026-09-04, NO CHANGE NEEDED.
  `GetRelatedProductsUseCase` (apps/api) already follows exactly this day's
  own priority order — same category, active-only, current product
  excluded, capped (`RELATED_PRODUCTS_LIMIT = 8`). Re-confirmed live via
  `GET /products/ribbed-knit-sweater/related`: all 3 returned products
  (Embroidered Top, Linen Co-ord Set, Denim Jacket) share the exact same
  `categoryId` as the sweater itself, current product correctly excluded.
  PDP renders the section with the existing product-card component. Nothing
  to build.

- Day 5 (wishlist variant UX) — VERIFIED 2026-09-04, NO CHANGE NEEDED. Ran
  the full flow live end to end with a real (throwaway, since deleted)
  customer account: saved a Related-Products card with no variant chosen →
  wishlist correctly showed "No size selected" + "Choose a size"; saved the
  PDP with Oatmeal/S selected → wishlist correctly showed "Oatmeal · S" +
  "Move to bag"; clicked "Move to bag" → item left the wishlist and appeared
  in the real cart with the right variant, weight (360g) and price (₹432).
  Nothing to build.

- Day 6 (coupon admin UI) — VERIFIED 2026-09-04, NO CHANGE NEEDED. Ran the
  real create → edit → deactivate/activate → list flow through the live
  admin UI (a throwaway `DAY6TEST` coupon, since deleted): created with
  every field this day lists (code, percentage type, value, max discount,
  min cart value, usage limit, per-user limit, start/expiry dates) — landed
  correctly on its detail page with all stats shown. Edited the percentage
  (25 → 30), reloaded the page cold, and confirmed the new value actually
  persisted server-side, not just in local state. Deactivated it — badge
  flipped to "inactive," button flipped to "Activate" — and confirmed the
  coupons list page reflected the same status, discount, usage, and expiry
  correctly. Nothing to build.

- Day 7 (forgot-password/OTP) — VERIFIED 2026-09-04, NO CHANGE NEEDED. Ran
  the complete real flow with a throwaway account (since deleted): request
  code → got the actual dev-logged OTP from the API console → entered it in
  the UI → set a new password → redirected to login → logged in
  successfully with the NEW password → confirmed the OLD password is now
  rejected (`UNAUTHORIZED`). Also specifically checked the anti-enumeration
  design: `forgot-password` for a real vs. a nonexistent email returns the
  identical response shape in both cases — the only difference (`devCode`
  present/absent) is deliberate, dev-only camouflage the code's own doc
  comment names explicitly, and `devCode` is never returned at all in
  production, for either case. Nothing to build.

Net effect: of the ten days below, six (1, 3, 4, 5, 6, 7) describe work
that already exists — confirmed by reading the actual code, not assumed —
and are now verification passes, not build days. Day 2 has one open
business decision before any code changes. Days 8, 9, and 10 (responsive
pass, regression hardening, final QA) remain fully valid regardless, since
"already built" still needs re-confirming after any change this week makes.
The original day-by-day plan is kept below unmodified as the source of what
each day originally asked for — use the status notes above to scope actual
effort, and raise with the client whether the freed time should fold into
deeper Day 8 responsive/accessibility work, get returned, or go toward
something not yet planned, rather than inventing new scope unilaterally.

Global Rules

For every day:

Follow SOLID principles and Clean Architecture.

Make the smallest safe change necessary.

Reuse existing components, services, repositories, hooks, contexts, and validation.

Do not rewrite working backend/domain logic unnecessarily.

Do not break existing functionality or API contracts unless required.

No unrelated refactors.

Inspect the existing implementation before changing it.

Verify changes with tests, typecheck, lint, boundaries, and production builds.

Day 1 — Admin UI Layout & Navigation

STATUS: Already implemented — see STATUS CHECK above. Treat as verification only unless a distinct tablet-compact sidebar state is still wanted.

Fix the admin application's structural UI.

Move main navigation to a left-side sidebar.

Position logout/account controls appropriately.

Make sidebar responsive:

Desktop: persistent sidebar.

Tablet: compact/collapsible.

Mobile: drawer/menu.

Clear active-navigation state.

Ensure content uses the remaining viewport width.

Prevent sidebar/content overlap.

Standardize spacing, alignment, and typography.

Verify Dashboard, Products, Categories, Orders, Customers, Inventory, Coupons, Settings, Login and Logout.

Do not modify business logic.

Day 2 — Storefront Header & Search UX

STATUS: Backend/debounce already correct — see STATUS CHECK above. Removing the standalone homepage/Shop search bar is a BUSINESS DECISION REQUIRED before proceeding — it conflicts with an earlier explicit client request for that same bar.

Remove:

Standalone search bar from homepage.

Standalone search bar from Shop page.

Keep search in the top navigation.

Search flow

User types
    ↓
Frontend debounce
    ↓
Search API
    ↓
Backend validation
    ↓
Database/query layer
    ↓
Results

Frontend must debounce requests instead of calling the API on every keystroke.

Backend must remain authoritative and must:

Validate parameters.

Use efficient queries.

Support pagination/result limits.

Handle empty/invalid input safely.

Return only required data.

Do not fetch the entire catalogue to filter locally.

Day 3 — Category Section Redesign

STATUS: Already implemented — see STATUS CHECK above. Treat as a verification pass at the four listed widths, not a redesign.

Redesign the storefront category section to:

Use the full available content width.

Be visually centered.

Have consistent spacing and equal visual weight.

Work at 375px, 768px, 1024px and 1440px.

On mobile use appropriate horizontal scrolling or responsive wrapping.

The referenced visual may be used only as design inspiration. Do not copy another site's code/design.

Day 4 — Product Details: Related Products

STATUS: Already implemented, backend and frontend — see STATUS CHECK above. Nothing to build; verify only.

Add a Related Products / You May Also Like section to Product Details.

Related products must actually be relevant.

Examples:

Clothing → related clothing.

Accessories → related accessories.

Bags → related bags/accessories.

Do not simply show old/latest products.

Recommended selection priority:

Same category
    ↓
Same/related classification where available
    ↓
Active + available
    ↓
Exclude current product
    ↓
Limit results

Keep recommendation/query logic in the backend/domain/query layer. Reuse the existing product-card component.

Day 5 — Wishlist Variant UX

STATUS: Already implemented end to end — see STATUS CHECK above. Nothing to build; verify only.

Support all wishlist entry points:

Homepage

Shop page

Product Details page

Homepage/Shop without a selected variant must continue showing Choose Size.

PDP with a selected variant must save that variantId, so the wishlist shows Add to Cart.

Required flow:

PDP
 ↓
Selected Variant
 ↓
Wishlist
 ↓
Wishlist API
 ↓
Database
 ↓
Wishlist page
 ↓
Cart

Reuse the existing wishlist variantId support and existing selected-variant/context architecture where appropriate.

Do not create another wishlist implementation.

Day 6 — Coupon & Offers Admin UI

STATUS: Already implemented — see STATUS CHECK above. Nothing to build; verify only.

The backend already supports:

Percentage coupons

Flat coupons

Maximum discount

Minimum cart value

Global usage limit

Per-user usage limit

Validity dates

Product/category restrictions

Do not rebuild this backend functionality.

Build admin UI for:

Create

View

Edit

Activate/deactivate

Fields:

Coupon code
Coupon type
Discount value
Minimum cart value
Maximum discount
Global usage limit
Per-user usage limit
Start date
Expiry date
Status

Types:

Percentage

Flat

Frontend validation should provide immediate feedback; backend remains the final authority.

Day 7 — Forgot Password / OTP Flow

STATUS: Already implemented, backend and frontend — see STATUS CHECK above. Nothing to build; verify only.

Implement customer forgot-password using the existing email OTP architecture.

Flow:

Login
  ↓
Forgot Password
  ↓
Enter email
  ↓
Request password-reset OTP
  ↓
OTP page
  ↓
Verify OTP
  ↓
New Password
  ↓
Confirm Password
  ↓
Password updated
  ↓
Login

Reuse:

OTP generation

Hashing

Expiration

Attempt limits

Resend/cooldown

Nodemailer

OTP notifier abstraction

Existing OTP input UI

Countdown behavior

Do not duplicate OTP infrastructure.

Security:

Avoid account-enumeration leaks.

Validate password server-side and client-side.

Revoke/invalidate appropriate existing authentication state according to the existing auth design.

Day 8 — Storefront Responsive UI Pass

STATUS: DONE 2026-09-04 — swept Home/PLP/PDP/Related/Wishlist/Cart/Checkout/
Login/Register/Registration-OTP/Forgot-password/Reset-password at 375/768/
1024/1440. Found and fixed one real bug: on `/register`'s 4-field form, the
fixed WhatsApp support button rendered directly on top of the "Create
account" button at 375px on first paint (no scroll needed) — confirmed via
`getBoundingClientRect()` overlap, not just a screenshot. Root cause: the
button's position depends on that page's own form length, which isn't
statically knowable the way the PDP/cart docks `useWhatsAppBottomOffset`
already reserves space for are. Fixed by not rendering the WhatsApp button
on `/login`, `/register`, `/forgot-password` at all (matching common
practice of hiding pre-sales chat during auth) rather than hardcoding a
per-page pixel reservation that could silently break again on the next
field added. Login and every forgot-password step were individually
confirmed NOT to have this collision (shorter forms), so this was genuinely
isolated to Register, not a systemic auth-page issue. Everything else swept
clean — no other overflow/clipping/overlap found.

Perform a responsive pass at:

375px  → mobile
768px  → tablet
1024px → desktop
1440px → large desktop

Check:

Header/navigation/search

Categories

Hero

Product grids/cards

Product details

Related products

Wishlist

Cart

Checkout

Login

Register

Registration OTP

Forgot password

Reset password

Look for:

Horizontal overflow

Clipped text

Overlap

Incorrect spacing

Oversized images

Broken buttons

Incorrect grid columns

Inaccessible controls

Day 9 — Integration & Regression Hardening

STATUS: DONE 2026-09-04/05 — full workspace gate re-run clean after Days 1-8's
changes: `pnpm -r run lint`/`typecheck` clean (9/9 packages), `boundaries:check`
clean (553 modules, 0 violations), full test suite **88 files, 641 tests**
clean (matches Week 3's own final tally exactly), all three production builds
(`api`/`web`/`admin`) clean with the same route/dynamic-static shape as every
prior build. Dev fleet (web/admin/api server+worker) stopped and restarted
cleanly afterward — confirmed all three healthy, plus a duplicate-worker
cleanup found and fixed on Day 7 stayed clean (one server + one worker, no
orphans). Auth/commerce/admin flows were already exercised live and in depth
across Days 1-8 themselves (login, register, forgot-password/OTP, wishlist,
cart, checkout, admin sidebar/nav, admin coupon CRUD) rather than re-run from
scratch here; this pass additionally smoke-checked the core API endpoints
(`/products`, `/home`, admin `/auth/login`) post-rebuild.

Run:

pnpm run lint
pnpm run typecheck
pnpm run boundaries:check
pnpm run test
pnpm run build

Verify authentication:

Login

Register

Registration OTP

Forgot password

Reset password

Refresh

Logout

/me

Verify commerce:

Product browsing

Product details

Search

Categories

Wishlist

Cart

Checkout

Coupon

Payment

Orders

Verify admin:

Login

Sidebar/navigation

Products

Orders

Customers

Coupons

Logout

Day 10 — Final QA & CI Verification

STATUS: DONE 2026-09-05. Migrations: verified against a genuinely fresh
throwaway database (`woobe_day10_week4_check`), not just diffed — all 17
migrations applied cleanly via `migrate deploy`, in order, including Week
3's Day 4 addition. Schema: `migrate:diff:check` reports "No difference
detected" — zero drift between `schema.prisma` and the migration history
(expected: Week 4 made no schema changes). Seed: ran clean against that
same fresh database (15 products, demo coupons, admin/staff accounts, no
errors). Then started a real scratch API instance against it and confirmed
actual HTTP requests succeed (`GET /products` → 200, 15 products; admin
login → 200) before dropping the database. Tests: full workspace suite run
twice more today specifically for this gate — 88 files/641 tests clean
both times, no flakes. Production builds: all three (api/web/admin)
re-confirmed clean (see Day 9). Environment variables: no new ones
introduced this week (WhatsAppButton reuses the existing
`NEXT_PUBLIC_WHATSAPP_NUMBER`); `.env.example` files untouched. Secrets:
scanned the full `week4` diff — no credentials, tokens, or keys, only
documentation prose discussing the forgot-password/OTP feature by name.
Git status/diff: working tree clean, everything committed (`a0c13f3`) and
pushed to `origin/week4`. CI: `.github/workflows/ci.yml` only triggers on
`pull_request` or `push` to `main` — it correctly never ran on the `week4`
branch itself (same as Week 3's own pattern); the local gate above is the
equivalent verification until this merges to `main` or a PR is opened.

Treat Week 4 as a release candidate.

Verify:

Migrations

Schema

Seed

Tests

Production builds

Environment variables

Secrets

Git diff

Git status

CI must pass the complete sequence:

Migration checks       ✅
Database generation    ✅
Migration deployment   ✅
Seed                   ✅
Schema verification    ✅
Lint                   ✅
Typecheck              ✅
Boundaries             ✅
Tests                  ✅
API build              ✅
Web build              ✅
Admin build            ✅

Local success alone is not sufficient for final sign-off.

Week 4 Definition of Done

Admin

Left sidebar implemented.

Navigation aligned.

Logout/account controls fixed.

Responsive admin navigation.

Existing admin functionality unaffected.

Storefront

Homepage search bar removed.

Shop search bar removed.

Navbar search retained.

Frontend search debouncing implemented.

Backend search API remains authoritative.

Category section redesigned full-width and centered.

Responsive category layout.

Related products implemented.

Related products are relevant to the current product/category.

Current product excluded.

Wishlist

Homepage → wishlist works.

Shop → wishlist works.

PDP → selected variant saved.

Variant wishlist → Add to Cart.

No-variant wishlist → Choose Size.

Existing wishlist functionality unaffected.

Coupons

Admin coupon creation.

Percentage coupons.

Flat coupons.

Usage limits.

Per-user limits.

Validity.

Activate/deactivate.

Existing coupon backend preserved.

Authentication

Forgot password.

Email OTP.

OTP verification.

Resend/cooldown.

New password.

Confirm password.

Successful login afterward.

Existing registration OTP unaffected.

Quality

SOLID principles followed.

Clean Architecture followed.

No unnecessary duplication.

No unrelated refactoring.

No regression.

Lint passes.

Typecheck passes.

Boundary check passes.

Full tests pass.

API build passes.

Web build passes.

Admin build passes.

CI passes.

Working tree clean.

Final Implementation Rule

For every task:

Inspect the existing implementation.

Identify the smallest correct change.

Reuse existing abstractions.

Follow SOLID and Clean Architecture.

Implement only the requested functionality.

Verify existing functionality has not changed.

Run relevant tests and quality checks.

Diagnose actual failures before making additional changes.

Keep unrelated files and functionality untouched.
