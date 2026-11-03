# Remove the demo catalogue from production

`remove-demo-products.sql` removes the demo products (and, by default, the rest of the
PR #18 demo dataset) without breaking order history. It previews by default and only
commits with `-v confirm=1`. Read the header of the SQL file for exactly what it matches.

## What it removes

| Source | How it is matched |
| --- | --- |
| `prisma/seed.ts` (15 products) | Fixed slug list: floral-wrap-dress, linen-coord-set, denim-jacket, silk-scarf, cotton-kurta, pleated-midi-skirt, embroidered-top, palazzo-pants, woven-tote-bag, statement-earrings, oxidised-jhumka-earrings, quilted-crossbody-bag, kolhapuri-leather-sandals, enamel-bangle-set, ribbed-knit-sweater |
| `demo-seed.ts` (PR #18, 34 products) | `slug LIKE 'demo-%'`, `sku LIKE 'DEMO-%'` |
| PR #18 demo data (skipped with `-v products_only=1`) | orders `DEMO-ORD-*` (with their payments, returns, refunds, testimonials, coupon redemptions), CUSTOMER accounts `@example.com`, coupons `DEMO-*`, its 4 offers (incl. the ALL_PRODUCTS "Sitewide 10% Off"), carts/addresses/webhook events `demo-*`, analytics sessions `demo-session-*`, categories and collections `demo-*` |

Kept: base categories (tops, dresses, bottoms, ethnic-wear, accessories), the new-drops and
most-loved collections, warehouse, pricing/GST/shipping, admin and staff users, the base
coupons WELCOME10 / FLAT200 / ACCESSORIES20, and every product not matched above.

Safety rules built in:

- A demo product on any order that is not itself deleted is **archived** (inactive, stock 0,
  unlinked from collections/coupons/offers/carts/wishlists), not deleted, because
  `order_items -> product_variants` is `ON DELETE RESTRICT`.
- Cart lines for removed variants are cleared from every cart.
- A coupon or PRODUCTS-scope offer that loses all its targets is **deactivated**. Otherwise
  SCARF15 (silk-scarf only) would become a 15% store-wide coupon.
- Everything runs in one transaction with `ON_ERROR_STOP`; a failure changes nothing.

## Run it (EC2, over SSM Session Manager)

The RDS instance is private, so run from the EC2 host. All commands use `sudo`.

```sh
# 0. Backup: take an RDS snapshot first (console: RDS > Databases >
#    woobe-production-postgres > Actions > Take snapshot), and also a dump on the host:
sudo docker run --rm --network host --env-file /opt/woobe/app/api.env -v /tmp:/out postgres:16 \
  sh -c 'pg_dump "${DATABASE_URL%%\?*}?sslmode=require" -Fc -f /out/woobe-before-demo-removal.dump && ls -lh /out/woobe-before-demo-removal.dump'

# 1. Fetch the script (pin a commit SHA instead of the branch name if you prefer).
curl -fsSL -o /tmp/remove-demo-products.sql \
  https://raw.githubusercontent.com/jsurya114/Wobee-ecommerce/claude/remove-demo-products/packages/database/prisma/ops/remove-demo-products.sql

# 2. Preview (rolls back, changes nothing). Read the "Products that STAY" list.
sudo docker run --rm -i --network host --env-file /opt/woobe/app/api.env postgres:16 \
  sh -c 'psql "${DATABASE_URL%%\?*}?sslmode=require" -X -f -' < /tmp/remove-demo-products.sql

# 3. Apply (only after the preview looks right).
sudo docker run --rm -i --network host --env-file /opt/woobe/app/api.env postgres:16 \
  sh -c 'psql "${DATABASE_URL%%\?*}?sslmode=require" -X -v confirm=1 -f -' < /tmp/remove-demo-products.sql

# 4. Bust the storefront catalog cache so removed products disappear right away.
sudo docker exec woobe-api node -e "const R=require('ioredis');const r=new R(process.env.REDIS_URL);r.incr('cache:catalog:version').then(v=>{console.log('catalog cache version',v);process.exit(0)})"
```

`${DATABASE_URL%%\?*}` strips Prisma-only query parameters (`schema`, `connection_limit`)
that psql rejects; `sslmode=require` is needed because RDS enforces TLS.

Products only (keep demo orders/customers/coupons/offers): add `-v products_only=1` to
steps 2 and 3. Demo products with demo orders are then archived, and the preview lists the
demo offers/coupons that stay active, including "Sitewide 10% Off".

Restore if needed: restore the RDS snapshot, or
`pg_restore --clean --if-exists -d "<url>" /tmp/woobe-before-demo-removal.dump`.

The script is idempotent: running it again after a successful apply finds nothing new.
