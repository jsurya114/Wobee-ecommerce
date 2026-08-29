# Woobe E-commerce — Week 2 Development Plan

> **Prerequisite:** Week 1 is complete and verified.  
> **Architecture:** Modular Monolith + Clean Architecture + SOLID.  
> **Rule:** Preserve completed Week 1 behavior unless an approved requirement/ADR requires a change.

## 1. Week 2 Objective

Expand the Week 1 commerce baseline into the supporting customer, merchandising, commerce, admin, and platform capabilities.

Week 1 baseline:

```text
Register/Login → Catalogue → Cart → Checkout → COD/Razorpay → Confirmed Order
```

Week 2 areas:

- Catalogue discovery
- Collections/merchandising
- Wishlist
- Customer profile
- Address management
- Reviews and ratings
- Coupons/promotions
- Shipping
- Returns
- Refunds
- Media management
- Homepage/content expansion
- Build Your Look/bundles where approved
- Admin products
- Admin inventory
- Admin orders
- Admin customers
- Notifications
- SEO
- Accessibility
- Performance
- Security
- Observability
- Testing

Only implement features supported by the approved requirements, design documents, and ADRs. Do not invent business rules.

---

# 2. Architecture Rules

Backend remains a TypeScript/Node.js modular monolith.

```text
apps/api/src/modules/
├── auth/
├── users/
├── products/
├── categories/
├── collections/
├── pricing/
├── inventory/
├── cart/
├── wishlist/
├── coupons/
├── orders/
├── payments/
├── shipping/
├── reviews/
├── returns/
├── refunds/
├── notifications/
└── admin/
```

Each module follows the existing Clean Architecture convention:

```text
module/
├── domain/
├── application/
├── infrastructure/
└── interface/
```

Dependency direction:

```text
Interface → Application → Domain
Infrastructure → implements required interfaces
```

Domain/application must not directly depend on Prisma, PostgreSQL, Express, Redis, Razorpay, S3/Cloudinary, or external provider SDKs.

`apps/web` and `apps/admin` must never access PostgreSQL/Prisma directly.

All authoritative business calculations happen on the server.

---

# 3. Module 1 — Catalogue Enhancement

Implement approved catalogue discovery:

- Advanced search
- Category filtering
- Collection filtering
- Size filtering
- Color filtering
- Availability filtering
- Price filtering where approved
- Sorting
- Pagination/infinite loading
- Clear/reset filters
- Result counts
- Empty states

API:

```text
GET /api/v1/products
GET /api/v1/categories
GET /api/v1/collections
```

Requirements:

- Server-side filtering
- Server-side sorting
- Bounded pagination
- Stable ordering
- Appropriate indexes
- No N+1 queries
- Server-authoritative price/inventory

Tests:

- Search
- Filters
- Combined filters
- Sorting
- Pagination
- Empty results
- Invalid parameters

---

# 4. Module 2 — Collections & Merchandising

Support approved collections such as:

- New Arrivals
- Best Sellers
- Featured
- Offers
- Seasonal/marketing collections

Admin:

- Create
- Edit
- Activate/deactivate
- Assign/remove products
- Reorder products
- Manage metadata

Customer:

- Collection listing
- Collection detail
- Product rails
- SEO-friendly collection URLs

---

# 5. Module 3 — Wishlist

Customer:

- Add product/variant
- Remove item
- View wishlist
- Check wishlist state
- Move/add to cart where approved

Rules:

- Authentication as required
- Prevent duplicates
- Handle inactive/out-of-stock products
- Server-authoritative availability

Tests:

- Add/remove
- Duplicate prevention
- Authorization
- Inactive product behavior
- Cart conversion

---

# 6. Module 4 — Customer Profile

Implement:

- View profile
- Edit permitted fields
- Account settings
- Mobile/email handling according to auth design

Never expose:

- Password hashes
- Access tokens
- Refresh tokens
- Payment secrets
- Security metadata

Sensitive identity changes must use the approved verification flow.

---

# 7. Module 5 — Address Management

Implement:

- Add address
- Edit address
- Delete address
- List addresses
- Set default address

Typical fields:

```text
name
mobile
addressLine1
addressLine2
city
state
pincode
country
isDefault
```

Use the approved schema if it already exists.

Rules:

- Validate required fields
- Validate pincode
- Users access only their own addresses
- Enforce one default address where required

---

# 8. Module 6 — Reviews & Ratings

Customer:

- View reviews
- Rating summary
- Submit review
- Edit/delete where approved
- Review photos where approved
- Verified-purchase indicator

Admin:

- View
- Moderate
- Approve/reject/hide where required

Rules:

- Enforce purchase eligibility where required
- Validate rating
- Prevent duplicate reviews according to requirements

Tests:

- Eligibility
- Authorization
- Rating validation
- Moderation
- Rating aggregation

---

# 9. Module 7 — Coupons & Promotions

Implement only approved discount types and rules:

- Coupon code
- Percentage discount
- Fixed discount
- Minimum order value
- Validity period
- Usage limit
- Per-customer usage
- Product/category applicability
- Active/inactive state

Server flow:

```text
Cart
 ↓
Validate coupon
 ↓
Determine eligible items
 ↓
Calculate discount
 ↓
Recalculate tax/shipping
 ↓
Final authoritative total
```

Never trust client subtotal, discount, tax, shipping, or grand total.

Tests:

- Valid/invalid
- Expired
- Minimum order
- Usage limits
- Per-user limits
- Product/category restrictions
- Duplicate application
- Concurrent redemption

---

# 10. Module 8 — Shipping

Create a provider-independent abstraction:

```text
ShippingService
├── calculateShipping()
├── getEstimate()
└── createShipment()
```

Support approved requirements:

- Pincode/serviceability
- Shipping methods
- Delivery estimate
- Shipping cost
- Free-shipping threshold
- Order shipping snapshot

External shipping SDKs remain in infrastructure.

Tests:

- Valid destination
- Invalid pincode
- Free shipping
- Standard shipping
- Delivery estimate
- Provider failure

---

# 11. Module 9 — Returns

Workflow:

```text
Customer
 ↓
Eligible order item
 ↓
Return request
 ↓
Reason
 ↓
Admin review
 ↓
Approved/Rejected
 ↓
Pickup/receipt where applicable
 ↓
Refund
```

Use the exact approved status model.

Rules:

- Return eligibility
- Return window
- Quantity validation
- Duplicate prevention
- Authorization
- Valid state transitions

---

# 12. Module 10 — Refunds

Separate refund from return approval.

```text
Return approved
 ↓
Refund requested
 ↓
Payment provider
 ↓
Refund processed
 ↓
Payment record updated
 ↓
Customer notified
```

Requirements:

- Provider abstraction
- Refund amount validation
- Idempotency
- Payment-state validation
- Refund record
- Failure/retry handling

Repeated requests must not create duplicate refunds.

---

# 13. Module 11 — Media Management

Use a provider-independent abstraction:

```text
MediaStorage
├── upload()
├── delete()
├── getUrl()
└── metadata()
```

Potential media:

```text
IMAGE
VIDEO
GIF
THREE_SIXTY
```

Only support types approved by requirements.

Support:

- Product media
- Variant media
- Collection media
- Admin uploads
- Ordering
- Alt text
- File validation
- Media status

Architecture:

```text
Application
 ↓
MediaStorage interface
 ↓
S3/Cloudinary implementation
```

---

# 14. Module 12 — Homepage Expansion

Week 1 used a focused real-data homepage.

Week 2 may expand approved sections when real content/data exists:

- Hero
- New Arrivals
- Best Sellers
- Featured Collections
- Offers
- Shop by Vibe
- How Woobe Works
- Customer Reviews
- UGC/Instagram
- Build Your Look

Do not invent:

- Reviews
- UGC
- Instagram content
- Lifestyle photography
- Bundle data
- Vibe categories
- Marketing claims

If client assets/data do not exist, keep the section deferred or use an intentional empty/content state.

---

# 15. Module 13 — Build Your Look / Bundles

Implement only if approved requirements and data exist.

Potential capabilities:

- Select base product
- Recommend compatible products
- Calculate combined weight
- Calculate combined price
- Add compatible items to cart
- Server-side recalculation

The browser must never be authoritative for bundle totals.

---

# 16. Module 14 — Admin Product Management

Admin product management:

```text
Products
Categories
Variants
Media
Pricing
Inventory
Collections
SEO
```

Operations:

- Create
- Edit
- Deactivate
- Variant management
- Weight
- Rate/kg overrides
- SKU
- Size
- Color
- Fabric
- Fit
- Measurements
- Stock
- Media
- SEO metadata

All protected by appropriate admin RBAC.

---

# 17. Module 15 — Admin Inventory

Admin inventory:

- Available quantity
- Reserved quantity
- Sold/consumed quantity where defined
- Stock adjustments
- Low-stock indicators
- Out-of-stock indicators
- Variant inventory

Manual adjustments must be:

- Authorized
- Validated
- Transaction-safe
- Auditable where required

Inventory must never become negative.

---

# 18. Module 16 — Admin Orders

Admin order dashboard:

```text
Pending Payment
Confirmed
Processing
Shipped
Delivered
Cancelled
Return Requested
Refunded
```

Use the existing approved order state machine.

Admin:

- List
- Search/filter
- View order
- Customer details
- Items
- Payment
- Shipping
- Timeline
- Allowed status transitions
- Return/refund state

Never allow arbitrary state mutation.

---

# 19. Module 17 — Admin Customers

Implement:

- Customer list
- Customer detail
- Orders
- Addresses where authorized
- Account status
- Search/filter
- Basic activity

Never expose passwords, password hashes, JWTs, refresh tokens, or payment secrets.

---

# 20. Module 18 — Notifications

Create provider-independent notifications.

Possible channels:

- Email
- SMS
- WhatsApp

Possible events:

- Order confirmed
- Payment successful
- Payment failed
- Order shipped
- Order delivered
- Return approved
- Refund processed

Architecture:

```text
API
 ↓
Application/domain event
 ↓
BullMQ
 ↓
Notification worker
 ↓
Provider
```

Requirements:

- Retry
- Idempotency where required
- Failure handling
- Structured logging
- No unnecessary blocking of checkout/order requests

---

# 21. Module 19 — SEO

Products:

- Metadata
- Canonical
- OpenGraph
- Product structured data
- Availability
- Price

Categories:

- Metadata
- Canonical
- OpenGraph

Collections:

- Metadata
- Canonical
- OpenGraph

URLs:

```text
/products/summer-dress
/categories/dresses
/collections/new-arrivals
```

Use real catalogue data.

---

# 22. Module 20 — Accessibility

Audit:

- Keyboard navigation
- Focus states
- Form labels/errors
- Semantic HTML
- ARIA where needed
- Color contrast
- Touch targets
- Screen-reader labels
- Image alt text
- Reduced-motion support

Primary target:

```text
375px
```

---

# 23. Module 21 — Performance

Frontend:

- Server rendering where appropriate
- Image optimization
- Lazy loading
- Code splitting
- Avoid unnecessary client components
- Avoid unnecessary API calls
- Skeleton loading states

Backend:

- Pagination
- Efficient queries
- No N+1
- Bounded responses
- Appropriate caching

Database:

Review indexes for:

- Products
- Categories
- Collections
- Wishlist
- Reviews
- Coupons
- Orders
- Addresses

Do not add indexes without a query/use-case reason.

---

# 24. Module 22 — Security Hardening

Review:

- Authentication
- RBAC
- Authorization
- Validation
- Rate limiting
- CORS
- Helmet
- Cookies
- CSRF considerations
- Secrets
- Logs
- File uploads
- Webhooks
- Coupon abuse
- Review authorization
- Admin authorization

Run available dependency/security checks.

---

# 25. Module 23 — Observability

Use:

- Structured logs
- Request IDs
- Error IDs
- Job IDs
- Payment IDs
- Order IDs
- Webhook IDs
- Inventory transaction IDs

Never log passwords, tokens, payment secrets, or unnecessary sensitive customer data.

---

# 26. Module 24 — Testing

Every implemented module requires appropriate tests.

## Unit tests

- Domain rules
- Discount rules
- Shipping rules
- Return eligibility
- Refund rules
- Review eligibility
- Wishlist rules

## Integration tests

- APIs
- Database
- Authorization
- Repositories
- Transactions
- Jobs

## E2E

Customer:

```text
Login
 ↓
Search
 ↓
Filter
 ↓
Product
 ↓
Wishlist
 ↓
Cart
 ↓
Coupon
 ↓
Checkout
 ↓
Order
 ↓
Return
 ↓
Refund
```

Admin:

```text
Login
 ↓
Products
 ↓
Inventory
 ↓
Orders
 ↓
Customers
 ↓
Returns
 ↓
Refunds
```

Only test features actually implemented.

---

# 27. Recommended Execution Order

Implement in dependency order rather than as one giant task.

## Day 1 — Catalogue Discovery

- Search
- Filters
- Sorting
- Pagination

## Day 2 — Collections + Wishlist

- Collections
- Wishlist

## Day 3 — Customer Account

- Profile
- Addresses

## Day 4 — Reviews + Media

- Reviews
- Media management

## Day 5 — Promotions + Shipping

- Coupons
- Shipping

## Day 6 — Returns + Refunds

- Returns
- Refunds

## Day 7 — Admin Expansion

- Admin Products
- Admin Inventory
- Admin Orders
- Admin Customers

## Day 8 — Homepage / Bundles / Notifications

- Homepage expansion
- Build Your Look where approved
- Notifications

## Day 9 — SEO / Accessibility / Performance

- SEO
- Accessibility
- Performance

## Day 10 — Security / Integration / Hardening

- Security audit
- Full regression
- E2E
- Mobile verification
- Performance verification
- Final Week 2 audit

If the approved project plan specifies a different number of days, preserve the approved schedule and use these dependency groups within it.

---

# 28. Git Strategy

Do not work directly on `main`.

```text
main
  │
  └── dev1
       ├── feature/catalog-search
       ├── feature/collections
       ├── feature/wishlist
       ├── feature/customer-profile
       ├── feature/reviews
       ├── feature/coupons
       ├── feature/shipping
       ├── feature/returns
       └── feature/admin-expansion
```

Use Conventional Commits:

```text
feat:
fix:
refactor:
test:
docs:
chore:
perf:
security:
```

---

# 29. Definition of Done

A module is complete only when:

```text
Requirement
 ↓
Domain rule
 ↓
Application use case
 ↓
Infrastructure
 ↓
API
 ↓
UI
 ↓
Validation
 ↓
Authorization
 ↓
Tests
 ↓
Documentation
```

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm boundaries:check
```

For UI work verify:

```text
375px
768px
1024px
1440px
```

---

# 30. Week 2 Completion Criteria

## Customer

- Catalogue discovery enhanced
- Search/filter/sort works
- Collections work
- Wishlist works
- Profile works
- Addresses work
- Reviews work where approved
- Coupons work where approved
- Shipping works where approved
- Returns work where approved
- Refunds work where approved
- Homepage uses approved real content
- Mobile UI works at 375px

## Admin

- Product management
- Inventory management
- Order management
- Customer management
- Collection management
- Review moderation where approved
- Return/refund management where approved

## Platform

- Notifications where implemented
- SEO metadata
- Accessibility improvements
- Performance review
- Security audit
- Full tests
- Build
- Module-boundary checks
- No secrets committed

---

# 31. Final Week 2 Verification

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm boundaries:check
```

Then verify:

```text
375px mobile
768px tablet
1024px desktop
1440px desktop
```

Test the actual implemented customer and admin flows.

Do not mark Week 2 complete based only on code existence or journal entries.

---

# 32. Scope Protection

Do not automatically add:

- AI recommendations
- Microservices
- Elasticsearch/OpenSearch
- Recommendation engines
- Loyalty program
- Referral system
- Social login
- Live chat
- Advanced analytics
- Warehouse management
- Multi-vendor marketplace

These require explicit product approval and separate planning.

---

# 33. Week 2 Handoff

At completion, produce:

1. Completed modules
2. Deferred modules
3. Database migrations
4. API endpoints
5. Frontend routes
6. Admin routes
7. Shared UI components
8. Infrastructure integrations
9. Test counts/results
10. Security findings
11. Performance findings
12. Known limitations
13. ADRs created/updated
14. Git commits
15. Deployment considerations
16. Recommended Week 3 scope


---

# 34. Mandatory Pre-Week-2 Remediation

The independent repository review found one real functional bug and one CI/process gap that must be handled before building new Week 2 functionality on top of the affected areas. The review was executed against the actual repository. [Source review: turn4file0, lines 5-11]

## 34.1 High — Paid-order cancellation must restock inventory

A confirmed/processing order reduces `quantityAvailable` when finalized. Cancellation currently reuses the pending-payment reservation-release operation, which only reduces `quantityReserved`. Because the reservation has already been finalized, the cancelled quantity is not returned to `quantityAvailable`. The review reproduced inventory changing `20 → 18` and remaining at `18` after cancellation. [Source review: turn4file0, lines 45-57]

### Required fix

Create a distinct **restock finalized sale** inventory operation.

```text
Pending-payment failure
    → release reservation
    → quantityReserved decreases

Confirmed/processing cancellation
    → restock finalized sale
    → quantityAvailable increases
```

Requirements:

- Add a clearly named restock operation.
- Do not reuse reservation-release for finalized sales.
- Wire `CancelOrderUseCase` correctly.
- Keep the operation transactional.
- Make repeated cancellation idempotent.
- Add a regression test that re-queries inventory after cancellation.
- Verify duplicate cancellation cannot double-restock.
- Preserve order status, refund, and audit behavior.

This is a **Day 0 blocker** before returns/exchanges or further inventory-dependent work.

---

# 35. Mandatory Web Build / CI Remediation

The independent review found that `apps/web` fails to build in a clean environment because the homepage performs a build-time API fetch while CI does not start the API server. Earlier local builds succeeded only when an API process happened to be running. [Source review: turn4file0, lines 65-83]

The review also found that GitHub Actions has never actually run for this repository. [Source review: turn4file0, lines 79-81]

Before adding more build-time data-fetching pages, choose and document one strategy:

### Option A — Dynamic rendering

Use Next.js dynamic rendering for pages requiring live API data.

### Option B — CI API startup

Have CI reliably start the API and required dependencies before building the web application.

### Option C — Approved fallback/error handling

Prevent build-time API failure from hard-failing the application build.

If the decision materially affects rendering architecture, create/update an ADR.

### CI acceptance

- Run the CI-equivalent checks locally.
- Push to a branch/PR.
- Confirm GitHub Actions actually executes.
- Confirm `apps/web` builds in the clean CI environment.
- Confirm migration/database/API ordering.
- Record the successful run in the Week 2 journal.

This is a **Day 0 platform blocker**.

---

# 36. Fresh-Environment Bootstrap

The review found recurring Prisma/stale `.next` cache issues and undocumented root environment-variable expectations. [Source review: turn4file0, lines 89-93]

Create/document a reproducible bootstrap path:

```text
git clone
 ↓
pnpm install
 ↓
bootstrap
 ↓
Prisma generate
 ↓
migrations
 ↓
seed when explicitly requested
 ↓
development servers
```

Preferred command:

```bash
pnpm run bootstrap
```

or an appropriate `postinstall` solution for Prisma generation.

Document:

- Required environment variables
- Root `.env` behavior
- Docker services
- PostgreSQL startup
- Redis startup
- Prisma generation
- Migration commands
- Seed commands
- Development server commands

The review also found the seed uses `.create` for `PricingSetting`, `ShippingRule`, and `GstSlab`, allowing duplicate rows on repeated seeds. Make seeding idempotent if this is included in approved scope. [Source review: turn4file0, lines 101-111]

---

# 37. Known Deferred Gaps

The review reconfirmed these existing gaps:

- No login/register rate limiting.
- No BullMQ yet.
- Abandoned `PENDING_PAYMENT` inventory-hold cleanup remains unresolved.
- Razorpay real test keys are not configured.
- Real Razorpay webhook testing requires a public HTTPS endpoint.
- Refund failure UI remains transient/manual follow-up.
- `ADMIN` enum cleanup is low priority. [Source review: turn4file0, lines 101-117]

Map these to the approved Week 2/3/4 scope before implementing. Do not automatically pull every deferred item into Week 2.

---

# 38. Revised Week 2 Execution Order

## Day 0 — Baseline Remediation

### A. Inventory cancellation restock

- Correct finalized-sale cancellation behavior.
- Add regression and idempotency tests.
- Verify inventory before/after cancellation.

### B. Web build / CI

- Decide rendering/CI strategy.
- Implement the approved solution.
- Run clean build.
- Execute GitHub Actions.
- Confirm successful CI.

### C. Bootstrap

- Document environment setup.
- Make Prisma generation reproducible.
- Address seed idempotency if approved.

### Day 0 acceptance

```text
Inventory cancellation     PASS
Web clean build            PASS
CI actually executed       PASS
Bootstrap documented       PASS
Week 1 regression          PASS
```

Only then start feature development.

## Day 1 — Catalogue Discovery

- Search
- Filters
- Sorting
- Pagination
- Empty/result states
- Query/index review

## Day 2 — Collections + Wishlist

- Collections
- Merchandising
- Wishlist

## Day 3 — Customer Account

- Profile
- Addresses

## Day 4 — Reviews + Media

- Reviews
- Moderation
- Media management

## Day 5 — Promotions + Shipping

- Coupons
- Shipping/serviceability
- Delivery estimates

## Day 6 — Returns + Refunds

- Return eligibility
- Return workflow
- Refund workflow
- Inventory implications
- Payment-provider abstraction

## Day 7 — Admin Expansion

- Admin Products
- Admin Inventory
- Admin Orders
- Admin Customers

## Day 8 — Homepage / Bundles / Notifications

- Homepage expansion
- Shop by Vibe where real data exists
- UGC/Instagram where real assets exist
- Build Your Look where approved
- Notifications

## Day 9 — SEO / Accessibility / Performance

- SEO
- Structured data
- Accessibility
- Responsive verification
- Performance optimization

## Day 10 — Security / Integration / Final Verification

- Security audit
- Full regression
- E2E
- Mobile verification
- Performance verification
- CI verification
- Final Week 2 audit

---

# 39. Week 2 Acceptance Gate

Week 2 is complete only when:

```text
Approved modules implemented
 ↓
Unit tests
 ↓
Integration tests
 ↓
E2E tests
 ↓
Lint
 ↓
Typecheck
 ↓
Module boundaries
 ↓
Production builds
 ↓
CI actually executed
 ↓
375px verification
 ↓
Desktop verification
 ↓
Security review
 ↓
Performance review
 ↓
Clean Git state
 ↓
Approved commits pushed to dev1
```

The final report must distinguish:

- Implemented
- Tested locally
- Verified in browser
- Verified in CI
- Blocked by external dependency
- Deferred by product scope

Do not mark an item complete merely because its code exists.

---

# 40. Independent Review Basis

The 2026-08-27 independent review found 88/88 tests passing, clean lint/typecheck/boundaries, migration integrity, API/admin builds passing, the web build failing in a cold environment, live customer and admin flows passing, one genuine inventory-restock correctness bug, CI not yet executed, and several documented deferred gaps. [Source review: turn4file0, lines 15-41]

The review itself made no code changes. [Source review: turn4file0, line 153]
