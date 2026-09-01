# Woobe Week 3 — Revenue Flow & Hardening Plan

## Goal

Complete and harden the core Woobe revenue flow:

Browse
→ Product
→ Cart
→ Checkout
→ Customer Details
→ Coupon
→ Shipping
→ Tax
→ Payment / COD
→ Order
→ Inventory Update
→ Order History

Week 3 is not complete merely because these features exist.

The complete revenue flow must be:

- Functionally correct
- Financially correct
- Transactionally safe
- Concurrency-safe
- Idempotent
- Secure
- Performant
- Browser verified
- Regression tested
- CI verified
- Architecturally consistent with the existing Woobe architecture

---

# Source of Truth

Before starting implementation, use the existing project context and documentation as the source of truth.

Refer to the existing:

- `project_planning/`
- `journal.md`
- `PLAN.md`
- `ARCHITECTURE.md`
- Existing ADRs
- Existing business decisions
- Existing Week 1 and Week 2 plans
- Existing implementation/journal context

IMPORTANT:

If the relevant project-planning documents have already been reviewed and are already available in context/memory, DO NOT repeatedly reread the same files unnecessarily.

Use the existing context and memory first.

Only reread a planning document when:

- the required information is not already available
- a specific decision needs verification
- the implementation conflicts with an existing decision
- the current task depends on details that are unclear

Do not invent new business rules when an existing project decision already defines them.

If a decision affects:

- Pricing
- GST
- Shipping
- Payment behavior
- Refund behavior
- Coupon policy
- Inventory/business rules
- Customer-facing commercial behavior

do not invent the business rule.

Record it as:

`BUSINESS DECISION REQUIRED`

---

# Development Branch / Existing Work

Use the current project branch and existing workflow established by the project.

Before modifying code:

1. Inspect current Git status.
2. Inspect current branch.
3. Inspect recent commits.
4. Review `journal.md` for recent development activity.
5. Understand changes already made by other developers.
6. Do not overwrite or revert valid existing work without evidence.

If another developer's changes are already present, treat them as the current implementation baseline.

Do not duplicate functionality that already exists.

---

# Non-Negotiable Engineering Rules

- Never trust frontend price.
- Never trust frontend discount.
- Never trust frontend stock.
- Never trust frontend shipping amount.
- Never trust frontend tax amount.
- Never trust frontend payment status.
- Recalculate checkout totals server-side.
- Use integer paise for INR monetary values.
- Use integer grams for weight.
- Never use floating-point arithmetic for authoritative monetary calculations.
- Define and consistently apply the approved rounding policy.
- All authoritative financial calculations must be deterministic.
- Use PostgreSQL transactions for order/inventory operations.
- Use variant-level inventory.
- Use row-level locking where stock-sensitive.
- Use idempotency for order/payment/webhook/inventory/coupon side effects.
- Verify payment webhooks server-side.
- Verify provider event identity.
- Snapshot authoritative order/product/financial values at order creation.
- Controllers must remain thin.
- Business rules belong in domain/application use cases.
- Validate all external input.
- Enforce authorization/RBAC server-side.
- Customers must never access another customer's order/data.
- Do not introduce microservices.
- Do not introduce unrelated scope.
- Tests must accompany implementation.
- Critical financial and inventory behavior requires integration/concurrency testing.
- External side effects must have deterministic retry/recovery behavior.
- Never hold a DB transaction open unnecessarily while waiting for an external service.
- Do not add caching that can make price, inventory, tax, payment, or coupon decisions stale.
- Do not weaken correctness to make tests pass.
- Do not use test-only behavior in production code to hide race conditions.
- Do not perform speculative architectural rewrites.

---

# Financial Invariants

All authoritative money values must use:

```text
Integer paise
```

All authoritative weight values must use:

```text
Integer grams
```

Never use floating-point arithmetic for authoritative financial calculations.

For every order:

```text
subtotal
+ shipping
+ tax
- discount
= final payable total
```

The exact calculation order and rounding policy must follow the existing approved project decision.

Additional invariants:

- The same authoritative cart state must produce the same total.
- Client-provided totals are informational only.
- Server-calculated totals are authoritative.
- Persisted order values must represent the values actually used to create the order.
- Payment amount must equal the authoritative payable amount.
- Refund amount must never exceed the refundable/captured amount.
- Multiple refund retries must not create multiple financial side effects.
- Product/rate changes must not allow the client to control checkout price.
- Tax must be calculated from the authoritative taxable amount.
- Shipping must be calculated server-side.
- Coupon discount must be calculated and validated server-side.

Test financial edge cases including:

- 1g
- Minimum allowed weight
- Odd gram quantities
- Maximum reasonable quantity
- Discount resulting in fractional paise
- GST resulting in fractional paise
- Shipping + discount + tax combined
- Price/rate changes after cart creation
- Coupon + shipping + tax
- Cancellation/refund of discounted orders

---

# Inventory Invariants

At all times:

```text
available_stock >= 0
reserved_stock >= 0
committed_stock >= 0
```

The system must guarantee:

- No successful order consumes the same inventory twice.
- Concurrent buyers cannot oversell stock.
- Inventory cannot become negative.
- Cancellation/release cannot restore more stock than was actually reserved.
- Failed checkout does not permanently consume inventory.
- Successful order commits the correct quantity.
- Retry of the same operation does not double-consume inventory.
- Inventory transitions are auditable where required.

Critical invariant:

```text
Stock = 1
Two simultaneous buyers
→ exactly one successful reservation/commit
→ stock never becomes negative
```

Repeat concurrency testing multiple times where practical.

---

# Transaction Boundary Rules

Before implementation, explicitly determine which operations occur:

1. Inside the PostgreSQL transaction
2. Outside the PostgreSQL transaction

Database state transitions such as:

- Inventory locking
- Inventory reservation
- Inventory commit
- Inventory release
- Order creation
- Order-item creation
- Coupon consumption
- Financial snapshot persistence
- Idempotency record persistence

must be transactionally consistent.

External operations such as:

- Payment gateway requests
- Email sending
- External shipping calls

must not create unsafe partial states.

Do not hold a database transaction open while waiting unnecessarily for an external service.

Every external side effect must have a deterministic recovery/retry strategy.

Document the chosen transaction boundary in the implementation/report.

---

# State Machine Requirements

Order, payment, inventory, and shipment states must have explicit valid transitions.

## Order

Use the existing project-defined states.

Example structure:

```text
PENDING_PAYMENT
    ├── success → CONFIRMED
    ├── failure → PAYMENT_FAILED
    └── timeout → CANCELLED

CONFIRMED
    → PROCESSING
    → SHIPPED
    → DELIVERED
```

Only valid transitions may be executed.

Invalid transitions must fail deterministically.

## Inventory

```text
AVAILABLE
    ↓
RESERVED
    ├── COMMITTED / SOLD
    └── RELEASED
```

## Payment

Use the existing project-defined payment states.

Explicitly define and test:

- Pending
- Successful
- Failed
- Cancelled
- Refunded
- Partially refunded, if supported

## State-transition edge cases

Test:

- Success after failure
- Success after timeout
- Webhook after cancellation
- Duplicate success
- Duplicate failure
- Out-of-order provider events
- Late webhook
- Unknown payment
- Unknown order
- Already processed event
- Already refunded payment
- Retry after partial failure

---

# Agent / Subagent Execution Model

Use the subagent system for implementation and verification.

## Model Assignment

Use:

### Sonnet

For:

- Architecture decisions
- Complex debugging
- Financial correctness
- Transaction design
- Concurrency design
- Payment/webhook logic
- Security decisions
- Cross-module decisions
- Root-cause analysis
- Reviewing worker/subagent findings
- Final decision making
- Final integration review

### Haiku

For:

- Simple implementation tasks
- Mechanical changes
- Straightforward tests
- Small refactors
- Documentation updates
- Simple investigation
- Repetitive code changes
- Non-complex verification tasks

Do not waste Sonnet tokens on trivial mechanical work.

Do not assign complex architectural or financial decisions to Haiku.

Sonnet acts as the decision-maker.
Haiku acts primarily as the worker.

---

# Subagent Reporting Requirement

Every subagent must produce a concise work report after finishing its task.

Each report must include:

```text
Task:
Subagent:
Model:
Status: PASS / FAIL / BLOCKED

What was investigated:
What was changed:
Files changed:
Tests executed:
Tests passed:
Tests failed:
Browser verification:
Security findings:
Performance findings:
Architecture findings:
Remaining issues:
Potential risks:
Recommended follow-up:
```

A subagent must never silently finish without reporting its result.

If a subagent discovers a P0/P1 issue, it must clearly identify it.

If a subagent is blocked, it must report:

- exact blocker
- attempted solution
- why it cannot proceed
- what decision/input is required

---

# Day 1 — Checkout Foundation

## Backend

Audit and implement/review:

- Existing cart
- Pricing
- Weight-based pricing
- Coupon
- Inventory
- Customer/address modules
- Checkout request contract
- Checkout response contract
- Guest checkout behavior
- Authenticated checkout behavior
- Validation schemas
- Checkout application use case
- Authoritative product/variant/pricing reads
- Inventory validation
- Coupon validation
- Server-side shipping calculation
- Server-side tax calculation
- Server-side final total calculation
- Stable error codes
- Transaction boundary
- Checkout idempotency

Client-provided totals must never become authoritative.

## Pricing

Verify:

```text
weight in grams
×
configured ₹/kg rate
=
authoritative price
```

Use integer-safe arithmetic.

Verify all relevant weight-based pricing edge cases.

## Tests

Test:

- Checkout validation
- Guest checkout
- Authenticated checkout
- Price recalculation
- Invalid variant
- Unavailable product
- Insufficient stock
- Invalid coupon
- Expired coupon
- Price changed after cart
- Shipping recalculation
- Tax recalculation
- Correct final total
- Repeated checkout request
- Invalid client-provided price
- Invalid client-provided shipping
- Invalid client-provided tax

## DoD

```text
Contract
↓
Domain/Application logic
↓
Infrastructure
↓
API
↓
Validation
↓
Authorization
↓
Idempotency
↓
Tests
```

---

# Day 2 — Customer Details, Shipping and Tax

## Checkout

Support according to existing project scope:

- Guest checkout
- Logged-in checkout
- Customer name
- Customer details
- Mobile
- Email
- Address
- Pincode
- State
- Saved addresses
- Shipping option
- Coupon
- Tax
- Final total

## Shipping

Implement/review:

- Pincode validation
- Serviceability
- Server-side shipping calculation
- Delivery estimate
- Shipping option selection
- Authoritative shipping amount

Never trust client shipping amount.

Test:

- Valid pincode
- Invalid pincode
- Serviceable pincode
- Unserviceable pincode
- Shipping calculation
- Shipping changes
- Delivery estimate
- Client shipping manipulation

## Tax

Determine according to approved business decisions:

- Seller state
- Customer shipping state
- Place of supply
- Taxable amount
- Approved GST configuration
- CGST/SGST for intra-state
- IGST for inter-state
- Total tax
- Order tax snapshot

Tax must be calculated server-side.

Test:

- Intra-state tax
- Inter-state tax
- Changed shipping state
- Coupon + tax
- Shipping + tax
- Coupon + shipping + tax
- Tax rounding

---

# Day 3 — Orders + Transactional Inventory

## Orders

Implement/review:

- Order model
- Order items
- Order address snapshot
- Stable order identifier
- Order status/state machine
- Order creation
- Customer order history foundation
- Admin order foundation
- Cancellation foundation

## Order Snapshot

At order creation persist authoritative values required by the project:

- Product ID
- Variant ID
- Product name
- Variant name
- Weight grams
- Rate per kg
- Unit price
- Quantity
- Discount
- Tax
- Shipping
- Final financial values

The order must remain historically correct even if:

- Product changes
- Variant changes
- Price/rate changes
- Tax settings change
- Shipping settings change
- Coupon changes
- Product is deleted/deactivated

## Inventory

Use PostgreSQL row-level locking where required:

```sql
SELECT ... FOR UPDATE
```

Inventory operations must be transactional.

## Concurrency Test

```text
Stock = 1

Buyer A ─┐
         ├── simultaneous checkout
Buyer B ─┘

Expected:
Exactly one succeeds.
Exactly one obtains the stock.
Stock never becomes negative.
```

---

# Day 4 — Payment Gateway + Payment Records

Support the approved payment provider abstraction:

- UPI
- Cards
- Net Banking
- COD

Do not hard-code business logic directly into provider-specific infrastructure.

## Payment Records

Implement/review:

- Payment record
- Payment transaction record
- Provider reference ID
- Payment status
- Order/payment relationship
- Failure handling
- Payment attempt history where required

## Idempotency

```text
Request
   ↓
Idempotency Key
   ↓
Existing?
 ┌─┴─┐
Yes  No
 ↓    ↓
Original
Result Execute
       ↓
    Persist
       ↓
    Return
```

Repeated requests with the same idempotency key must not create duplicate orders or duplicate financial effects.

## Tests

- Payment creation
- Duplicate request
- Same idempotency key
- Different idempotency key
- COD
- Payment failure
- Payment retry
- State consistency
- Payment/order relationship
- Amount mismatch
- Client payment-status manipulation

---

# Day 5 — Webhooks + Verification + Failure Handling

Implement:

```text
Webhook
   ↓
Verify signature
   ↓
Verify provider event identity
   ↓
Already processed?
   ├── Yes → return success
   └── No
         ↓
   Process transactionally
         ↓
   Mark event processed
```

## Requirements

- Verify webhook signature
- Verify provider event ID
- Enforce event uniqueness where appropriate
- Make processing idempotent
- Make retries safe
- Make business effects transactional
- Reject forged webhook requests
- Handle unknown payment/order safely

## Test

- Valid payment
- Failed payment
- Invalid signature
- Duplicate webhook
- Repeated webhook
- Out-of-order events
- Unknown payment
- Unknown order
- Retry
- Late webhook
- Webhook after cancellation
- Duplicate business effect prevention

Critical requirement:

```text
Same webhook received twice
→ exactly one business effect
```

---

# Day 6 — Customer Orders + Admin Orders + Cancellation

## Customer

Implement/review:

- Order history
- Order detail
- Order status
- Payment status
- Shipment status where available
- Stored order totals
- Loading state
- Error state
- Empty state

## Admin

Implement/review:

- Order listing
- Order detail
- Payment visibility
- Customer relationship
- Shipment information
- Status management

## Authorization

Guarantee:

- Customer sees only own orders
- Admin requires RBAC
- Order identifiers cannot bypass authorization
- No IDOR/BOLA
- Staff permissions follow the existing contracted role model

## Cancellation

Implement/review:

- Valid state transitions
- Authorized cancellation
- Transactional cancellation
- Correct inventory release
- Payment state consistency
- Idempotent cancellation
- Safe repeated cancellation requests

Test:

- Valid cancellation
- Invalid cancellation
- Unauthorized cancellation
- Cross-customer cancellation attempt
- Cancellation after payment
- Cancellation after shipment where applicable
- Duplicate cancellation
- Inventory release
- Payment/refund consistency

---

# Day 7 — Shipping Records + Shipment Status

Implement/review:

- Shipping calculation integration
- Delivery estimate
- Pincode validation
- Shipping record
- Shipment status foundation

## UI

Verify:

- Shipping option
- Delivery estimate
- Shipping charge
- Shipment status
- Order shipping information

## Tests

- Serviceable pincode
- Unserviceable pincode
- Shipping calculation
- Delivery estimate
- Shipping record
- Shipment transitions
- Invalid shipment transitions
- Order/shipping consistency

---

# Day 8 — Notifications + BullMQ

## Infrastructure

Implement/review:

- Redis
- BullMQ worker
- Job payloads
- Job identity
- Job idempotency
- Retry policy
- Retryable failure classification
- Non-retryable failure classification

## Notifications

Implement/review:

- Order confirmation
- Payment notification
- Basic email jobs
- Customer notifications where supported
- Admin notifications where appropriate

## Duplicate Prevention

Prevent duplicate sends caused by:

- Retry
- Worker restart
- Duplicate event
- Duplicate job
- Concurrent workers
- Crash before/after send

Use an atomic claim-before-send or equivalent safe mechanism.

## Tests

- Enqueue
- Worker processing
- Success
- Retryable failure
- Non-retryable failure
- Duplicate job
- Worker restart
- Concurrent workers
- Claim-before-send
- Duplicate send prevention

---

# Day 9 — Full Revenue-Flow Hardening

Day 9 is the main integration and adversarial testing phase.

Run all mandatory E2E scenarios.

---

# Mandatory E2E Scenarios

## 1. Normal Purchase

```text
Browse
→ Product
→ Cart
→ Checkout
→ Payment
→ Webhook
→ Order
→ Inventory update
```

Verify:

- Correct weight
- Correct ₹/kg rate
- Correct line price
- Correct subtotal
- Correct coupon
- Correct shipping
- Correct GST
- Correct final total
- Correct payment amount
- Correct order
- Correct inventory update

---

## 2. Payment Retry

```text
Payment failed
→ Retry
→ Success
→ Exactly one confirmed order
```

Verify:

- No duplicate order
- No duplicate inventory consumption
- Correct payment state
- Correct order state

---

## 3. Duplicate Checkout

```text
Same idempotency key
→ Multiple requests
→ One order
```

Verify:

- Exactly one order
- Exactly one financial effect
- Exactly one inventory effect
- Same response/result where appropriate

---

## 4. Duplicate Webhook

```text
Same webhook event twice
→ One business effect
```

Verify:

- One payment transition
- One order transition
- One inventory effect
- One notification side effect where applicable

---

## 5. Concurrent Inventory

```text
Stock = 1
→ Buyer A + Buyer B simultaneously
→ Exactly one winner
```

Verify:

- No overselling
- No negative stock
- Correct loser behavior
- Correct order state
- Correct inventory state

---

## 6. Price Change After Cart

```text
Product added to cart
→ Authoritative product/rate changes
→ Checkout
```

Verify:

- Checkout uses current authoritative pricing according to approved business rules.
- Frontend cannot force old price.
- Final persisted order values are correct.

---

## 7. Coupon Concurrency

```text
One coupon use remaining
→ Two simultaneous checkouts
→ Exactly one consumes it
```

Also test:

- Same customer simultaneous attempts
- Maximum coupon usage
- Per-customer limits where supported
- Expiration during checkout
- Disabled coupon
- Failed payment after coupon consumption
- Cancelled order after coupon consumption
- Checkout retry
- Duplicate coupon consumption

---

## 8. Refund Retry

Only if refund functionality already exists.

```text
Refund request
→ Retry same request
→ One gateway refund
→ One business effect
```

Verify:

- Refund cannot exceed captured amount
- Repeated refund request is idempotent
- Discounted orders refund correctly
- Persisted refund amount is authoritative
- Financial reconciliation remains correct

---

## 9. External-Service Failure

Test deterministic behavior for:

- Payment gateway timeout
- Payment gateway failure
- Webhook delay
- Webhook retry
- Email provider failure
- Redis/BullMQ failure
- Shipping service failure if applicable

For each failure determine:

- Database state
- Order state
- Payment state
- Inventory state
- Coupon state
- Retry behavior
- Customer retry behavior
- Admin intervention requirements

---

# Financial Reconciliation

For representative test orders, independently verify persisted values.

Do not rely only on the UI.

Verify:

```text
subtotal
+ shipping
+ tax
- discount
= final total
```

Then:

```text
payment amount
= authoritative payable amount
```

For refunds:

```text
total refunds
<= captured amount
```

and:

```text
refunds
+ retained amount
= captured amount
```

All monetary values must remain integer paise.

Verify financial values through authoritative API/database records independently of browser display.

Test:

- Full-price order
- Discounted order
- Tax
- Shipping
- Coupon
- Discounted refund
- COD
- Successful online payment
- Failed payment
- Payment retry

---

# Coupon Correctness

Coupon operations must be safe under concurrency.

Verify:

- Coupon validity
- Expiration
- Usage limits
- Per-customer limits where supported
- Minimum order requirements
- Applicable products/categories where supported
- Discount calculation
- Rounding
- Atomic consumption
- Failed checkout behavior
- Cancellation behavior
- Refund interaction

The client must never be able to choose its own discount amount.

---

# Security Sweep

Review and test:

## Authentication

- Login
- Registration
- Session handling
- Token handling
- Logout
- Protected routes

## Authorization

- RBAC
- Customer/admin boundary
- Object-level authorization
- IDOR
- BOLA
- Privilege escalation

## Financial Security

- Price manipulation
- Discount manipulation
- Stock manipulation
- Shipping manipulation
- Tax manipulation
- Payment-status manipulation
- Refund manipulation
- Duplicate financial requests

## Webhooks

- Signature bypass
- Forged events
- Replay
- Duplicate events
- Unknown event IDs

## Secrets

Check for:

- API keys
- Payment credentials
- JWT secrets
- Database credentials
- Cloud credentials
- Tokens

No secrets may be committed or logged.

## Sensitive Logging

Do not log:

- Authentication tokens
- Payment credentials
- Card information
- Secrets
- Unnecessary PII

---

# Abuse Protection

Review rate limiting and abuse protection for:

- Login
- Registration
- Checkout
- Coupon validation
- Payment creation
- Webhook endpoint
- Password reset if implemented
- Admin authentication

Verify that rate limiting does not break legitimate idempotent retries.

If implementation is outside Week 3 scope, document it instead of silently expanding scope.

---

# Performance Review

Review the entire revenue flow for:

- N+1 queries
- Excessive database calls
- Unnecessary API calls
- Unnecessary React rerenders
- Excessive `useEffect`
- Unnecessary client components
- Oversized bundles
- Image optimization problems
- Unbounded database queries
- Missing pagination/limits
- Expensive Prisma queries
- Memory leaks
- Unnecessary polling
- Redis misuse
- Cache misuse
- Stale financial cache
- Stale inventory cache

Do not cache authoritative:

- Price
- Inventory
- Tax
- Shipping
- Payment
- Coupon

data in a way that can produce incorrect financial decisions.

---

# Observability

Critical operations should be traceable.

Where appropriate, use structured logging and correlation/request identifiers.

Track:

- Checkout attempt
- Order creation
- Payment creation
- Payment webhook
- Inventory reservation
- Inventory release
- Inventory commit
- Coupon consumption
- Refund
- Notification job

A single order/payment should be traceable across:

```text
API
→ Database
→ Payment
→ Webhook
→ Worker
→ Notification
```

Never log secrets or unnecessary sensitive information.

---

# Database / Migration Verification

Verify:

- Prisma schema
- Migration history
- Database schema
- Required indexes
- Required unique constraints
- Foreign keys
- Transaction behavior
- No schema drift
- No destructive migration
- No accidental production-data deletion

Test:

## Fresh Database

```text
Empty DB
→ Migrations
→ Seed
→ Application starts
```

## Existing Database

```text
Week 2 DB
→ Week 3 migrations
→ Application starts
```

Verify:

- Migrations apply successfully
- Prisma schema matches migration state
- Required indexes exist in PostgreSQL
- Required constraints exist in PostgreSQL
- Seed is deterministic/reproducible
- Migration failure does not silently corrupt state

---

# Browser Automation

Browser automation is mandatory.

Do not mark functionality as working solely because:

- Source code looks correct
- Unit tests pass
- Integration tests pass
- API tests pass

The actual browser must verify:

```text
UI
↓
API
↓
Application logic
↓
Database
```

## Required Viewports

Test:

- 375px
- 768px
- 1024px
- 1440px

## Customer Flow

Test:

```text
Homepage
→ Catalogue
→ Product listing
→ Product detail
→ Variant
→ Weight
→ ₹/kg
→ Calculated price
→ Add to cart
→ Cart
→ Checkout
→ Customer details
→ Address
→ Coupon
→ Shipping
→ Tax
→ Payment / COD
→ Confirmation
→ Order history
```

Verify displayed values against authoritative server responses.

## Admin Flow

Test:

- Admin login
- Dashboard/navigation
- Orders
- Order detail
- Payment visibility
- Shipment information
- Product functionality
- Inventory functionality
- Settings
- Role permissions
- Forbidden actions

## Browser Bug Report

For every issue record:

- Page
- Viewport
- Action
- Expected result
- Actual result
- Console error
- Network/API error
- Reproduction steps
- Severity

---

# Production-Like Verification

After the production build:

- Start the built applications.
- Verify environment variables.
- Verify frontend/API configuration.
- Verify database connectivity.
- Verify Redis connectivity.
- Verify BullMQ worker startup.
- Verify migrations.
- Verify critical API routes.
- Verify critical browser flow.

Do not rely exclusively on `next dev`.

---

# Day 10 — Final Verification

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm boundaries:check
```

Also run all relevant:

- Unit tests
- Integration tests
- E2E tests
- Concurrency tests
- Security tests
- Browser automation
- Production-build verification

## Verify

- Migration integrity
- Zero schema drift
- Required indexes
- Required constraints
- Transaction correctness
- Reproducible test database
- No destructive migration
- 375px UI
- 768px UI
- 1024px UI
- 1440px UI
- No horizontal overflow
- Checkout
- Payment
- Order
- Shipping
- Inventory
- Coupon
- Loading states
- Error states
- Empty states
- Full normal purchase E2E
- Critical failure scenarios
- Concurrency scenarios
- Security review
- Performance review
- Financial reconciliation
- Git diff
- Secrets scan
- Clean Git state

---

# Test Reliability

A green test run is not sufficient if the suite is known to be flaky.

If a test fails:

1. Determine whether it is a real product failure.
2. Determine whether it is a test-isolation problem.
3. Determine whether it is an environment problem.
4. Determine whether it is a race condition.
5. Do not simply increase timeouts until the failure disappears.

Run the full suite repeatedly when practical.

Document:

```text
Run 1:
Run 2:
Run 3:
Run 4:
Run 5:
```

If failures remain, document the exact failures and classify them.

Do not claim 100% reliability when the suite is still flaky.

---

# CI Verification

CI must actually execute on the final Week 3 commit.

Local success is NOT CI verification.

The final Week 3 state must be validated by CI.

Verify that CI executes the required:

- Install
- Lint
- Typecheck
- Tests
- Build
- Boundaries
- Relevant E2E/security checks

Do not mark Week 3 complete merely because the local machine passes.

---

# Git Verification

Before final completion:

```bash
git status
git diff
git diff --cached
git log --oneline -10
```

Verify:

- Only intended changes exist.
- No debug code.
- No temporary files.
- No secrets.
- No generated junk.
- No unrelated refactors.
- No accidental changes from another worktree.
- No unresolved merge artifacts.

Do not merge to `main` without explicit approval.

Approved Week 3 changes may be pushed to `dev1` only after final review.

---

# Definition of Done

Every implemented module must follow:

```text
Requirement
↓
Domain Rule
↓
Application Use Case
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

Critical financial/inventory/payment features additionally require:

```text
Server-side calculation
+
Transaction boundary
+
Concurrency strategy
+
Idempotency
+
Failure handling
+
Integration tests
+
E2E verification
+
Financial reconciliation
```

---

# Acceptance Gate

Week 3 is complete only after:

```text
Approved modules
↓
Unit tests
↓
Integration tests
↓
Concurrency tests
↓
E2E tests
↓
Lint
↓
Typecheck
↓
Boundaries
↓
Production build
↓
375px / 768px / 1024px / 1440px
↓
Browser verification
↓
Security review
↓
Performance review
↓
Financial reconciliation
↓
Migration verification
↓
CI actually executed
↓
CI passes on final commit
↓
Git diff review
↓
Secrets review
↓
Clean Git state
↓
Approved commits pushed to dev1
↓
WEEK 3 COMPLETE
```

---

# Final Reporting Requirements

The final report must clearly distinguish:

- Implemented
- Tested locally
- Browser verified
- Production-build verified
- CI verified
- Security verified
- Performance verified
- Concurrency verified
- Financially reconciled
- Blocked by external dependency
- Business decision required
- Deferred by product scope

For every failed test or finding, report:

- Severity
- Category
- Reproduction
- Root cause
- Evidence
- Fix
- Regression test
- Remaining risk

Do not hide failures simply because they are inconvenient.

---

# Required Final Week 3 Report

The final orchestrator/decision-maker must produce a consolidated report containing:

## 1. Executive Summary

```text
Status:
Scope completed:
Major changes:
Major risks:
```

## 2. Subagent Reports

Include every subagent:

```text
Subagent:
Model:
Task:
Status:
Findings:
Changes:
Tests:
Browser verification:
Remaining issues:
```

## 3. Bugs Found

Table:

```text
| ID | Severity | Area | Bug | Root Cause | Fix | Verified |
|----|----------|------|-----|------------|-----|----------|
```

## 4. Security Findings

```text
P0:
P1:
P2:
P3:
Informational:
```

## 5. Performance Findings

Include:

- Query issues
- N+1 findings
- Rendering issues
- Bundle issues
- API issues
- Memory issues
- Caching issues

## 6. Financial Verification

Include at minimum:

- Weight pricing verification
- Subtotal
- Discount
- Shipping
- GST
- Final total
- Payment amount
- Refund amount where applicable

## 7. Concurrency Verification

Include:

- Inventory race result
- Coupon race result
- Idempotency race result
- Webhook duplicate result
- Notification duplicate result

## 8. Browser Verification

Include:

```text
Customer:
PASS / FAIL

Admin:
PASS / FAIL

375px:
PASS / FAIL

768px:
PASS / FAIL

1024px:
PASS / FAIL

1440px:
PASS / FAIL
```

## 9. Test Results

Include:

```text
Unit:
Integration:
E2E:
Concurrency:
Security:
Total:
Passed:
Failed:
Flaky:
```

## 10. CI

Include:

```text
CI run:
Commit:
Result:
Failed jobs:
```

## 11. Remaining P2/P3 Issues

Clearly list all deferred findings.

Do not silently ignore them.

## 12. Final Recommendation

Use exactly one:

```text
READY
READY WITH MINOR ISSUES
BLOCKED
```

Explain why.

---

# Final Status

Use exactly one:

## PASS

Use only when:

- No P0/P1 issues remain.
- Core revenue flow works.
- Critical financial invariants pass.
- Critical concurrency tests pass.
- Security review passes.
- Browser verification passes.
- Production build works.
- CI passes on the final commit.
- Final Git state is clean.

## PASS WITH MINOR ISSUES

Use when:

- Core revenue flow works.
- No P0/P1 blockers remain.
- P2/P3 issues remain documented.
- None of the remaining issues threaten:
  - Financial correctness
  - Security
  - Inventory integrity
  - Payment integrity
  - Core checkout behavior

## BLOCKED

Use when:

- P0/P1 issue remains.
- Financial reconciliation fails.
- Inventory concurrency is unsafe.
- Payment/webhook integrity is unsafe.
- Authorization/security is compromised.
- Mandatory browser verification cannot be completed.
- CI fails on the final commit.
- Production build is broken.
- Critical external dependency prevents required verification.

---

# Scope Discipline

Do not:

- Introduce microservices.
- Rewrite working architecture.
- Introduce unrelated features.
- Perform speculative refactoring.
- Replace existing architectural decisions without evidence.
- Change business rules without approval.
- Weaken security for convenience.
- Weaken financial correctness for speed.
- Hide flaky tests.
- Mark unverified functionality as complete.

If an issue is discovered outside Week 3 scope:

1. Determine whether it affects Week 3 correctness/security.
2. If it does, fix it or block completion.
3. If it does not, document it as deferred.

---

# Final Principle

The objective is not:

```text
"All features exist."
```

The objective is:

```text
Correct
+
Secure
+
Financially accurate
+
Concurrency-safe
+
Idempotent
+
Performant
+
Architecturally sound
+
Browser verified
+
Tested
+
CI verified
=
Woobe Week 3 Complete
```

Do not mark Week 3 complete merely because code exists or local tests pass.