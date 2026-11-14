# Load tests

`shopper-journey.js` is a [k6](https://k6.io) test that plays a realistic Woobe
shopper against the API: home, browse a category, search (typeahead then
results), open a product, and for some shoppers add to bag, log in and place a
COD order. Each virtual user (VU) is one shopper with human-like pauses between
pages, and VUs ramp up in steps so you can see where latency starts to climb.

## Never run this against production

It registers users, fills carts and places orders. Run it against a throwaway
copy of the API with its own Postgres and Redis, never against
www.woobe.in or a database from a `.env` file.

## Setting up the target

1. Start a throwaway Postgres and Redis, then run `prisma migrate deploy` and
   `pnpm run db:seed` against them.
2. Give the seeded variants plenty of stock, otherwise checkouts start failing
   once stock runs out, for example:
   `UPDATE inventory SET "quantityAvailable" = 1000000;`
3. Start the API (and worker) against that database with `TRUST_PROXY_HOPS=1`.
   The test gives each shopper its own `X-Forwarded-For` address, as nginx does
   in production. Without this the per-IP rate limits (login 30 per 10 min,
   cart 120 per 5 min) treat every VU as one person and you mostly measure 429s.
4. To mimic production, pin the API to 2 CPUs (`taskset -c 0,1` or
   `docker run --cpus 2 --memory 2g`) and keep the load generator on other
   cores or another machine.

## Running

```sh
k6 run -e BASE_URL=http://127.0.0.1:4000 -e PEAK_VUS=600 loadtests/shopper-journey.js
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `BASE_URL` | `http://127.0.0.1:4000` | API origin (without `/api/v1`) |
| `PEAK_VUS` | `300` | Shoppers at the top of the ramp (steps at 25%, 50%, 75%, 100%) |
| `STEP_DURATION` | `2m` | How long each step holds |
| `LOGIN_USERS` | `PEAK_VUS` | Accounts registered in setup; keep it at least `PEAK_VUS` |
| `ADD_TO_BAG_RATE` | `0.3` | Share of shoppers who add to bag |
| `CHECKOUT_RATE` | `0.3` | Share of those who log in and check out |
| `THINK_SCALE` | `1` | Multiplier on page pauses; `0` turns them off (stress mode) |

Setup registers `LOGIN_USERS` accounts first. Each one costs a bcrypt hash, so
expect setup to take a minute or two.

The thresholds (under 1% failed requests, page reads p95 under 800 ms, login
and checkout p95 under 2 s) are what "the shop still feels fine" means here.
The highest step that still passes them is the capacity figure.

Some checkouts are expected to come back 422 when a bag is under the 1 kg
minimum weight. That is the business rule working, not a failure of capacity.
