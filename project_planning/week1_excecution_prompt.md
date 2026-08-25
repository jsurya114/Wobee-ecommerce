# Woobe — Week 1 Execution Plan (Foundation)

You are continuing as Senior Software Architect and Technical Lead on Woobe. The architecture is approved (`ARCHITECTURE.md`, `PLAN.md`, ADR-001 through ADR-018). **This document is your Week 1 task list — implement it module by module, in order. Do not skip ahead to Week 2 scope (catalogue, pricing, cart) under any circumstance.**

Stop after each module and report before starting the next: files created, tests passing, any deviation from spec and why.

---

## Module A — Monorepo & Tooling Foundation

- Initialize pnpm workspace: `apps/{web,admin,api}`, `packages/{database,types,validation,ui,config,utils}`
- Root-level `tsconfig.base.json`, shared ESLint + Prettier config in `packages/config`
- **Module boundary enforcement (ADR-010):** configure `dependency-cruiser` (or `eslint-plugin-boundaries`) so `apps/api/src/modules/<x>` can only import Prisma models it owns — wire this into CI in Module C, not just locally
- `docker-compose.yml` for local Postgres + Redis
- `.env.example` covering every secret the architecture needs (DB URL, Redis URL, JWT secret, Razorpay key/secret/webhook secret, S3/Cloudinary creds, Cloudflare) — no real values
- `.gitignore` (never commit `.env`, credentials, keys)
- Confirm git branch strategy (`main`, `develop`, `feature/*`, `fix/*`, `hotfix/*`) and commit convention are documented (already in `DEVELOPMENT_RULES.md` — verify, don't recreate)

**Done when:** `pnpm install` succeeds at root, empty apps/packages boot without errors, lint runs clean, boundary-check tool is installed and configured (rules will bite once Module D adds real modules).

---

## Module B — Database Schema (`packages/database`)

Full Prisma schema, **all domains represented now**, even if only `auth` has business logic this week:

`User`, `AuthCredential` (per ADR-018 — `method` column, not a password field on `User`), `Product`, `ProductVariant`, `Category`, `Collection`, `Warehouse` (single seeded row per ADR-015), `Inventory` (`variant_id`, `warehouse_id`, `quantity_available`, `quantity_reserved`), `Cart`, `CartItem` (per ADR-011), `Wishlist`, `Coupon`, `Order`, `OrderItem` (price-snapshot fields: `product_name`, `weight_grams`, `rate_per_kg`, `unit_price`, `quantity`, `discount`, `tax` — per original brief §6), `Payment` (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` per ADR-014), `PaymentWebhookEvent` (unique constraint on `provider` + `event_id`), `Shipment`, `Return`, `ReturnItem`, `Refund` (separate from `Order.status` — per §4 correction, item-level, `order_id` FK), `Review`, `Notification`, `AdminAuditLog`.

Rules that apply to every table, not just some:
- Money fields: `Int` (paise), never `Float`/`Decimal` shortcuts
- Weight: `Int` (grams)
- Every table gets `created_at`/`updated_at`
- `warehouse_id` present on `Inventory` even with only one seeded warehouse row (ADR-015 — additive later, not a rewrite)

Initial migration + a seed script that creates: one warehouse row, one default admin user, one default ₹/kg rate setting.

**Done when:** `prisma migrate dev` runs clean, seed script populates the three rows above, `prisma studio` shows every table listed.

---

## Module C — CI Pipeline (ADR-013)

GitHub Actions workflow on every PR: lint → typecheck → unit + integration tests → `prisma migrate diff` check (fails the build on a destructive migration unless a human has explicitly acknowledged it — never auto-apply). Wire in the Module A boundary-check tool as a required step.

**Done when:** a deliberately broken PR (lint error, then a destructive migration) fails the pipeline for the right reason each time.

---

## Module D — Auth Module (`apps/api/src/modules/auth`) — ADR-018

- `AuthCredential` table, `method: 'password'` for now (leaves room for `'otp'` later without touching `User`)
- bcrypt password hashing (cost factor documented, not just defaulted)
- JWT access token (short-lived) + rotating refresh token in an httpOnly, secure, `SameSite=strict` cookie
- Endpoints: register, login, refresh, logout
- Basic RBAC: `customer` / `admin` roles, middleware to guard admin routes
- Unit tests: password hashing, token issuance/verification/expiry, refresh rotation
- Integration test: full register → login → access protected route → refresh → logout flow

**Done when:** the Definition of Done checklist in `PLAN.md` §5 passes for this module specifically — zero TS errors, zero boundary violations, tests green, `security-guidance` plugin clean on the diff.

---

## Module E — Shared Packages

- `packages/types` — `Money` (paise-based), `Weight` (grams-based), and core domain DTOs used across modules
- `packages/validation` — Zod schemas, starting with auth (register/login payloads); structure it so each future module adds its own schema file here
- `packages/utils` — pure, unit-tested conversion helpers: grams↔kg, paise↔rupees. These get used everywhere pricing touches the UI, so they need tests now, not "later"
- `packages/ui` — base design tokens (color, type scale, spacing) for a premium fashion aesthetic, plus primitive components (Button, Input, Card) built mobile-first. Use the `frontend-design` plugin for this — don't hand-roll generic defaults.

**Done when:** `packages/utils`'s money/weight helpers have 100% branch coverage on rounding edge cases (this is the one place a silent bug becomes a pricing bug everywhere downstream).

---

## Module F — Base Mobile-First Layout

- `apps/web`: responsive shell (header, mobile nav/drawer, footer) built from `packages/ui` tokens, 375px viewport as the design baseline, not an afterthought
- `apps/admin`: minimal admin shell (sidebar nav, auth-gated)
- No real pages yet beyond a placeholder home route — this is shell + design system, not Week 2's catalogue UI

**Done when:** `chrome-devtools-mcp` confirms both shells render correctly at 375px and at desktop width, no console errors.

---

## Module G — ADR Cleanup

Split ADR-010 through ADR-018 out of `PLAN.md` into individual `docs/adr/ADR-0NN-<slug>.md` files, matching the `Context / Decision / Alternatives / Consequences` format already used for ADR-001–009. Keep `PLAN.md` as the narrative summary; the individual ADR files become the source of truth per file, consistent with the original doc structure requirement.

**Done when:** every ADR from 001–018 exists as its own file under `docs/adr/`, same format, no gaps in numbering.

---

## Week 1 Order of Execution

Day 1 → Module A · Day 2 → Module B · Day 3 → Module C + Module G · Day 4 → Module D · Day 5 → Module E + F, then a full Week 1 review against `PLAN.md` §5's Definition of Done.

**Stop at the end of Day 5.** Report status against every module above before Week 2 (catalogue, pricing, cart) begins.