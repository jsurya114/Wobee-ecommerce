# Pre-Day-4 Patch

Days 1–3 are already built. This is *not* a redo — it's the small, additive catch-up needed before Day 4 (checkout/GST/shipping) can rely on ADR-023 (admin-configurable settings) and ADR-024 (role-based admin access). Three items, roughly half a day, not a rebuild.

---

## 1. Add the missing settings schema (additive migration)

- **New table `GstSlab`:** `id`, `maxPricePaise` (nullable — null means "no upper bound," for the top slab), `ratePercent`, `createdAt`. Seed two rows: `{maxPricePaise: 250000, ratePercent: 5}` (₹2,500 in paise), `{maxPricePaise: null, ratePercent: 18}`.
- **Extend existing `ShippingRule`** (already has `standardFeePaise` per Day 1) with two new columns: `minOrderWeightGrams` (seed `1000`), `freeDeliveryThresholdGrams` (seed `1500`).
- `PricingSetting` — no change needed if Day 1 already built this as a DB-backed default rate (it should have been); if it was seeded as a raw constant instead, convert it to a proper settings row now, same pattern as the other two.

This is one migration, additive only — nothing here touches existing tables' existing columns, so it can't break Days 1–3.

---

## 2. Verify and patch cart weight-threshold logic (Day 3)

**Check this specifically:** did Day 3's cart module hardcode `1000`/`1500` (or the weight-threshold UI copy) directly, rather than reading from `ShippingRule`? If ADR-021 was implemented before ADR-023 existed, this is likely — fixed numbers were the only option at the time.

- If hardcoded: swap the cart module's threshold checks and the `WeightThresholdBanner` component's values to read from `ShippingRule` (via the API, not a client-side constant).
- If already reading from a config/settings source: no change needed, skip this item.

This is the one place actual rework is possible — everything else in this patch is pure addition.

---

## 3. Replace binary RBAC with the ADR-024 role/permission model

- Extend `User.role` from `customer`/`admin` to the four contracted roles (`customer`, `super_admin`, `order_processing_staff`, `product_management_staff` — matches the quotation's §6 exactly). Migrate the existing seeded admin user's role to `super_admin`.
- Add a `permissions.ts` config mapping each admin-tier role to its permission set (§ADR-024).
- Update the Day 2 RBAC middleware to check for a required permission (e.g. `requirePermission('MANAGE_SETTINGS')`) instead of a raw `role === 'admin'` string comparison. Since no admin-only routes exist yet in Days 1–3 (the admin settings UI is still Week 2+ scope), this is a middleware/config change with no route-level rework required right now — it just means Day 4 onward builds on the right foundation instead of the binary one.

---

## After this patch

Proceed with `WEEK1_PLAN.md` Day 4 exactly as written — checkout, inventory locking, and GST/shipping calculation were already designed against `GstSlab`/`ShippingRule` and were never built yet, so nothing there needs to change.