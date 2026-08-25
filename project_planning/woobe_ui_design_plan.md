# Woobe — UI Design Plan

Grounded in the four provided references (Woobe desktop homepage, two Woobe mobile homepage variants, one LimeRoad competitor reference) plus current e-commerce UX research and the current (Aug 2026) React/Next.js component ecosystem. Companion to `ARCHITECTURE.md` §4 (component-based frontend structure) — this document defines *what* gets built there; §4 defines *where*.

---

## 1. Brand & Design Direction

**Brand:** WOOBE — serif wordmark, tagline "Fashion, by weight." Core positioning: transparent, weight-based pricing as the differentiator — every product surface (card, listing, detail) shows weight + rate/kg + resulting price, not price alone. This isn't decoration; it's the product's actual pricing mechanic (`PLAN.md` §6) made visible.

**Tone:** premium-but-approachable, editorial, feminine without being saccharine. Soft natural-light photography, generous whitespace, a trust-forward footer row (Transparent Pricing / Real Products / Easy Exchanges / Secure Payments) that turns the pricing model into a selling point rather than hiding it.

**Reference contrast:** LimeRoad (the competitor reference) is denser and more promo-driven — price-bucketed tiles, a floating sale badge, an app-install banner competing for attention above the fold. Woobe's own mockups are cleaner and more editorial. **Recommendation: keep Woobe's cleaner direction as the primary language** — it fits "premium" better than promo-density does — but borrow one genuinely useful LimeRoad pattern (§8.1).

**Minor inconsistency to reconcile, not urgent:** the mobile mockups show two slightly different accent tones for the tagline/price text — one rose, one leaning terracotta-orange. Pick one as canonical when a designer finalizes exact brand hex values (see §3's note on this being a starting palette, not a pixel-sampled one).

---

## 2. Design Principles

Grounded in current e-commerce UX research, not asserted:

- **Mobile-first is the floor, not a target** — mobile accounts for the large majority of e-commerce traffic globally, <cite index="38-1">and specifically 75–80% in India</cite>, which is Woobe's market. Design for a 375px viewport first; desktop is the adaptation, not the other way around.
- **Speed is a UX feature, not an ops concern** — <cite index="33-1">a 100ms delay can cost roughly 7% of conversions</cite>, and <cite index="38-1">mobile conversion already runs behind desktop (roughly 2% vs 3.7%) largely because of this gap</cite>. Every animation/library choice in §6 is picked partly for bundle weight.
- **Clarity beats cleverness on the product page** — <cite index="33-1">high-resolution media and transparent pricing are the primary drivers of buyer confidence</cite>, which maps directly onto Woobe's weight/rate/price display — this isn't just a UI pattern, it's the trust mechanism.
- **Show the product in context** — <cite index="38-1">the majority of shoppers want to see a product in a real setting within the first images, but most sites don't provide this</cite>. Product galleries should lead with one styled/lifestyle shot before the flat product shots.
- **Frictionless checkout** — <cite index="33-1">guest checkout and minimal-field forms are the most effective way to reduce cart abandonment</cite>. Matches ADR-011 exactly — guest checkout was already an architectural decision; this is the UX reason it matters.
- **Sticky purchase action on mobile** — <cite index="38-1">the add-to-cart/buy button should stay visible while scrolling on mobile product pages</cite>; a surprisingly common miss.
- **Accessibility is baseline, not optional** — <cite index="33-1">WCAG compliance is both a requirement and a reach into an underserved market, not just a compliance checkbox</cite>. See §10.

---

## 3. Color System

**Note on these values:** derived from the visual direction in the provided mockups (dusty rose / warm cream / charcoal), not pixel-sampled from a brand file. Treat as a professionally-reasoned starting palette — swap in exact hex values immediately if a designer already has them.

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#C77B8A` (Woobe Rose) | CTAs, price highlight, active states |
| `--color-primary-hover` | `#B36473` | Button hover/pressed |
| `--color-primary-tint` | `#F3DEE2` | Badge backgrounds, subtle highlights |
| `--color-background` | `#FBF1EC` (warm ivory) | Page background |
| `--color-surface` | `#FFFFFF` | Cards, modals |
| `--color-text-primary` | `#262220` (soft charcoal, not pure black) | Body/headline text |
| `--color-text-secondary` | `#8C7F7A` | Meta text — weight, SKU, secondary labels |
| `--color-border` | `#EDE3DF` | Dividers, card borders |
| `--color-success` | `#7A9B76` (muted sage, not bright green) | In-stock, order confirmed |
| `--color-error` | `#B5453F` (muted brick, not pure red) | Out of stock, form errors |

**Accessibility check required before build:** rose-on-ivory text combinations must be verified against WCAG AA contrast (4.5:1 for body text). `--color-primary` on `--color-background` will likely fail for small text — use it for large text/buttons/icons, and use `--color-text-primary` for anything that needs to be read at body size. Run this through a contrast checker once real values are finalized, don't eyeball it.

---

## 4. Typography

- **Display/headlines:** Playfair Display (or Cormorant Garamond as an alternative) — elegant, high-contrast serif, matches the wordmark's editorial fashion register. Google Fonts, free, variable weight.
- **Body/UI:** Inter — near-universal readability at small sizes, wide weight range, pairs cleanly against a serif display without competing.
- **Scale (mobile-first, rem-based):** `xs` 0.75 / `sm` 0.875 / `base` 1 / `lg` 1.125 / `xl` 1.25 / `2xl` 1.5 / `3xl` 2 / `4xl` 2.75 — display sizes (`3xl`/`4xl`) reserved for Playfair, everything else Inter.

---

## 5. Spacing, Radius, Elevation

- **Spacing scale:** 4px base unit (4/8/12/16/24/32/48/64) — standard Tailwind scale, no need to deviate.
- **Radius:** soft, not sharp — `8px` for buttons/inputs, `16px` for cards, `9999px` (pill) for badges and category chips (matches "Shop by Vibe" pill pattern in the mockups).
- **Elevation:** minimal — one soft shadow token for cards (`0 2px 12px rgba(38,34,32,0.06)`), a slightly stronger one for modals/dialogs. Avoid heavy drop shadows; the mockups' aesthetic is flat/editorial, not skeuomorphic.

These become the actual token files under `packages/ui/src/tokens/` per `ARCHITECTURE.md` §4.1.

---

## 6. Component Library Stack (ADR-022 — full detail)

| Need | Choice | Why |
|---|---|---|
| Component base | shadcn/ui on **Base UI** primitives | <cite index="42-1">shadcn/ui is the default choice for new Next.js/Tailwind projects in 2026, and now supports Base UI as well as Radix — worth choosing Base UI here since Radix's maintenance pace has slowed since its acquisition by WorkOS</cite>. Components generate directly into `packages/ui` — you own the code, not a black-box dependency. |
| Styling | Tailwind CSS | Already the `frontend-design` plugin's convention; zero-runtime, small bundles. |
| Animation | **Motion** (`motion/react`) | <cite index="49-1">This is the current package name — it was renamed from `framer-motion` to `motion` in late 2024</cite>; same API, same team, don't install the old package name. Use for scroll-reveal on homepage sections, page transitions, and the "add to cart" micro-interaction. |
| Carousels/rails | shadcn/ui's Carousel component (Embla underneath) | <cite index="60-1">Embla is minimal, hook-driven, and built for exactly this — design systems and controlled animations rather than a heavy pre-styled slider</cite>. Powers New Drops, Most Loved, "Shop by Vibe," and product image thumbnails. |
| Product zoom/lightbox | Custom, built on shadcn's Dialog (Base UI underneath) | Keeps it consistent with the rest of the primitive set instead of pulling in a separate gallery dependency. If Week 1 time pressure makes that impractical, `react-image-gallery` is a reasonable fallback with pinch-zoom built in — swap later, not a hard commitment either way. |
| Forms | react-hook-form + Zod resolver | Already required by ADR-020 — the same Zod schema validates the form client-side and the request server-side. |
| Toasts | sonner | Standard shadcn-ecosystem choice, minimal bundle. |
| Icons | lucide-react | Standard shadcn icon set. |

---

## 7. Component Inventory (mapped to `ARCHITECTURE.md` §4)

**`packages/ui/primitives`** (domain-agnostic): Button, Input, Badge, Card, Spinner, Dialog, Select, Checkbox, RadioGroup, Carousel (shadcn wrapper).

**`packages/ui/components`** (composed, still domain-agnostic): PriceTag (handles the weight/rate/price triple display), RatingStars, ImageCarousel, ProgressBar (powers the weight-threshold indicator, §8.3), Skeleton loaders.

**`apps/web/features/catalog/components`** (domain-specific): ProductCard, ProductGrid, VariantSelector, SizeChartModal, ProductGallery (zoom/lightbox composition).

**`apps/web/features/cart/components`**: CartLineItem, CartSummary, WeightThresholdBanner (the "Add 350g more" component from the mobile mockup — built on the primitive ProgressBar).

**`apps/web/features/checkout/components`**: AddressForm, PaymentMethodSelector (Razorpay / COD), OrderSummary.

---

## 8. Homepage Blueprint

Section order, drawn directly from the mockups (both desktop and mobile agree on this sequence):

1. **Hero** — rotating slides, tagline + CTA ("Shop New Drops"). Mobile mockup shows a video-capable hero (play button overlay) — support both image and video slides.
2. **USP row** — New / Trending / Under ₹[X] — three icon+label entries, horizontally scrollable on mobile.
3. **Shop by Vibe** — circular category tiles (Minimal/Feminine/Edgy/Trendy) — a style-based entry point distinct from product-type categories, worth keeping as-is, it's a nice differentiator.
4. **New Drops** — product rail, each card showing weight + rate/kg + price (the PriceTag component).
5. **Build Your Look** — a mix-and-match bundle calculator (Top + Bottom + Accessories = Total). **Flagging this as new scope**, not previously in `PLAN.md`: functionally it's just summing three already-known product prices and adding a "complete look" cart action — no new pricing logic needed, but it is a new feature surface. Recommend deferring the *build* to Week 2+ (it's not on the Week 1 critical path per `WEEK1_PLAN.md`), but reserve the homepage layout slot for it now so Week 1's shell doesn't need restructuring later.
6. **Woobe Girls / UGC strip** — social proof, real-customer photos.
7. **Most Loved** — second product rail.
8. **Why Woobe?** — trust-signal row (Transparent Pricing / Real Products / Easy Exchanges / Secure Payments).
9. **Newsletter signup**.
10. **Footer** — standard e-commerce footer (shop links, help, policies).

### 8.1 One pattern worth borrowing from LimeRoad

LimeRoad's "Pick Your Style" module — price-bucketed shoppable tiles ("Under ₹899," "Under ₹999") — is a genuinely useful discovery pattern that Woobe's current New Drops/Most Loved rails don't cover (those are curated, not budget-filtered). Worth adding as an optional homepage module between §8's items 3 and 4: "Shop by Budget" using the same visual language as the existing product cards, just pre-filtered by price bucket. Not urgent — a Week 2+ addition, not Week 1.

### 8.2 Weight threshold component (resolves ADR-021)

The mobile mockup's cart-weight progress bar is correct and becomes canonical, with the confirmed rule: shows current cart weight against the **1,000g minimum** to unlock checkout, and separately indicates progress toward the **1,500g free-delivery threshold** once past the minimum. Two-stage progress bar, not one:
- Below 1,000g: bar shows "Add [X]g more to place your order," checkout disabled.
- 1,000g–1,499g: checkout enabled, bar (or a secondary indicator) shows "Add [X]g more for free delivery."
- 1,500g+: "Free delivery unlocked" state, no further prompt.

This component reads from the server-computed cart weight (never client-summed) per ADR-021.

---

## 9. Key Page Specs

**Product Listing (PLP):** grid (2-col mobile, 4-col desktop), filter/sort as a bottom sheet on mobile (not a sidebar — sidebars fight mobile-first), each card = ProductCard (image, name, weight, rate/kg, price, wishlist heart).

**Product Detail (PDP):** gallery leads with a lifestyle/styled shot before flat product shots (§2), variant selector (color/size as a two-axis grid matching the original brief's Red/S, Red/M pattern), weight + rate/kg + calculated price displayed prominently (not buried), size chart as a modal, sticky add-to-cart bar on mobile scroll (§2), delivery estimate, return/exchange info, reviews below the fold.

**Cart:** line items with weight/rate/price per the original brief's cart field list, WeightThresholdBanner at the top (§8.2), server-computed subtotal/discount/shipping/tax/grand total — never client-summed, matching ADR-011/ADR-021.

**Checkout:** single-page (not multi-step wizard) where possible — fewer steps, matches §2's frictionless-checkout principle — guest fields first, account login as an option, not a gate.

**Account/Orders:** minimal for Week 1 (order list + status only, per `WEEK1_PLAN.md`'s Day 5 scope) — returns/exchange management UI is Week 4 scope, not built yet.

---

## 10. Mobile Navigation — Decision

The two mobile mockups show different bottom-nav layouts: one with Home/Search/Wishlist/Bag/Account, the other with Home/Category/**Quick Add (+)**/Bag/Account.

**Recommendation: go with Home/Search/Wishlist/Bag/Account.** Reasoning: search deserves a dedicated, habitual one-tap slot in a catalogue-heavy app rather than relying solely on a top search bar (which invites "look something up" intent, not browsing). Wishlist is a core engagement loop for fashion shoppers — save-for-later behavior — and deserves its own destination tab, not just heart icons scattered on cards with nowhere to collect them. A central "Quick Add" action is more of a social/content-app pattern and risks confusing first-time shoppers about what it does; a per-card quick-add affordance achieves the same speed without spending a primary nav slot on it.

This is a UX call, not a locked business decision — override it if you'd rather keep Quick Add.

---

## 11. Motion Guidelines

Keep it restrained — editorial brands read as premium partly *because* they don't over-animate:
- Scroll-reveal (fade + slight upward translate) on homepage sections, once, not on every scroll re-entry
- Add-to-cart: brief scale/bounce on the cart icon badge, not a full modal takeover
- Page transitions: simple crossfade, not slide/parallax — keeps it fast and keeps focus on product imagery, not the chrome around it
- Respect `prefers-reduced-motion` — Motion's `useReducedMotion` hook makes this a one-line addition, not an afterthought

---

## 12. Accessibility & Performance Checklist

- WCAG AA contrast on every text/background pairing (§3) — verify, don't assume
- Minimum 44×44px tap targets on mobile, especially wishlist hearts and cart quantity steppers on product cards
- All product images have descriptive alt text (product name + color, not just "product image")
- `next/image` for every product image — responsive sizes, lazy loading below the fold, matches ADR-017's CDN/ISR strategy
- Sticky mobile buy button (§2) implemented as `position: sticky`, not a scroll-listener — cheaper, no jank
- Reduced-motion respected everywhere Motion is used (§11)