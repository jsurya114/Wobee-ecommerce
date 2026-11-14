// k6 load test: a realistic Woobe shopper journey against the API.
//
// NEVER point this at production. It registers users, fills carts and places
// COD orders. Run it against a throwaway copy of the API with its own
// database (see loadtests/README.md).
//
//   k6 run -e BASE_URL=http://127.0.0.1:4000 -e PEAK_VUS=300 loadtests/shopper-journey.js
//
// Each virtual user (VU) is one shopper: home -> browse a category -> search
// -> open a product -> maybe add to bag -> maybe log in and check out, with
// human-like pauses between pages. VUs ramp up in steps so the summary shows
// where latency starts to climb.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE = (__ENV.BASE_URL || "http://127.0.0.1:4000").replace(/\/$/, "") + "/api/v1";
const PEAK = Number(__ENV.PEAK_VUS || 300);
const STEP = __ENV.STEP_DURATION || "2m";
// Keep LOGIN_USERS >= PEAK_VUS so no two shoppers share an account.
const USERS = Number(__ENV.LOGIN_USERS || PEAK);
// Share of shoppers that add to bag, and of those that log in and check out.
const ADD_TO_BAG = Number(__ENV.ADD_TO_BAG_RATE || 0.3);
const CHECKOUT = Number(__ENV.CHECKOUT_RATE || 0.3);
// Seconds a person spends on a page. THINK=0 turns pauses off (stress mode).
const THINK = Number(__ENV.THINK_SCALE ?? 1);

const step = (f) => Math.max(1, Math.round(PEAK * f));

export const options = {
  setupTimeout: "10m",
  scenarios: {
    shoppers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: step(0.1) },
        { duration: STEP, target: step(0.25) },
        { duration: STEP, target: step(0.5) },
        { duration: STEP, target: step(0.75) },
        { duration: STEP, target: PEAK },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    // What "OK" means for a shop: most pages answer fast, almost none fail.
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:read}": ["p(95)<800"],
    "http_req_duration{kind:login}": ["p(95)<2000"],
    "http_req_duration{kind:checkout}": ["p(95)<2000"],
  },
};

const ordersPlaced = new Counter("orders_placed");
const journeyTime = new Trend("journey_duration", true);

const SEARCH_TERMS = ["ear", "top", "dress", "kurti", "scarf", "jeans", "bag", "silk", "cotton", "ring"];

// Every shopper gets their own client IP, as in production where nginx sets
// X-Forwarded-For from Cloudflare. Without this, the API's per-IP rate limits
// (login 30 per 10 min, cart 120 per 5 min) would treat all VUs as one person.
// The test API must run with TRUST_PROXY_HOPS=1 for this to take effect.
function ipFor(n) {
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

function pause(min, max) {
  if (THINK > 0) sleep((min + Math.random() * (max - min)) * THINK);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function json(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

export function setup() {
  // Register the accounts used for login + checkout. Registration costs a
  // bcrypt hash each, so this is done once up front, not during the ramp.
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const email = `lt-${Date.now()}-${i}@loadtest.invalid`;
    const password = "Loadtest1";
    const res = http.post(
      `${BASE}/auth/register`,
      JSON.stringify({ name: "Load Tester", email, password }),
      { headers: { "content-type": "application/json", "x-forwarded-for": ipFor(60000 + i) }, tags: { kind: "setup" } },
    );
    if (res.status === 201 || res.status === 200) users.push({ email, password });
  }
  if (users.length === 0) throw new Error("setup: could not register any load-test users");

  const products = json(http.get(`${BASE}/products?limit=48`, { tags: { kind: "setup" } }));
  const categories = json(http.get(`${BASE}/categories`, { tags: { kind: "setup" } }));
  return {
    users,
    slugs: (products?.products || []).map((p) => p.slug),
    categories: (categories?.categories || []).map((c) => c.slug),
  };
}

export default function (data) {
  const started = Date.now();
  const ip = ipFor(__VU);
  const base = { "x-forwarded-for": ip };
  const get = (path, name) =>
    http.get(`${BASE}${path}`, { headers: base, tags: { kind: "read", name } });

  group("home", () => {
    const r = get("/home", "home");
    check(r, { "home 200": (x) => x.status === 200 });
    get("/cart", "cart");
  });
  pause(3, 8);

  group("browse category", () => {
    get("/categories", "categories");
    const cat = data.categories.length ? pick(data.categories) : null;
    const r = get(cat ? `/products?category=${cat}` : "/products", "product list");
    check(r, { "list 200": (x) => x.status === 200 });
  });
  pause(4, 10);

  let slug = data.slugs.length ? pick(data.slugs) : null;
  group("search", () => {
    const term = pick(SEARCH_TERMS);
    // Typeahead fires as the shopper types, then the results page.
    get(`/products/suggestions?q=${term.slice(0, 2)}`, "suggestions");
    get(`/products/suggestions?q=${term}`, "suggestions");
    const r = get(`/products?q=${term}`, "search");
    check(r, { "search 200": (x) => x.status === 200 });
    const found = json(r)?.products;
    if (found && found.length) slug = pick(found).slug;
  });
  pause(3, 8);

  if (!slug) return;
  let variantId = null;
  let quantity = 1;
  group("product page", () => {
    const r = get(`/products/${slug}`, "product");
    check(r, { "product 200": (x) => x.status === 200 });
    get(`/products/${slug}/related`, "related");
    const variants = json(r)?.product?.variants || [];
    const inStock = variants.filter((v) => v.inStock);
    if (inStock.length) {
      const v = pick(inStock);
      variantId = v.id;
      // Checkout needs at least 1 kg in the bag, so buy enough of light items.
      quantity = Math.min(20, Math.ceil(1000 / (v.weightGrams || 1000)));
    }
  });
  pause(5, 15);

  if (!variantId || Math.random() > ADD_TO_BAG) {
    journeyTime.add(Date.now() - started);
    return;
  }

  group("add to bag", () => {
    const r = http.post(`${BASE}/cart/items`, JSON.stringify({ variantId, quantity }), {
      headers: { ...base, "content-type": "application/json" },
      tags: { kind: "write", name: "add to bag" },
    });
    check(r, { "add to bag ok": (x) => x.status === 200 || x.status === 201 });
    get("/cart", "cart");
  });
  pause(3, 8);

  if (Math.random() > CHECKOUT) {
    journeyTime.add(Date.now() - started);
    return;
  }

  // One account per VU: two shoppers on one account would share (and empty) one bag.
  const user = data.users[(__VU - 1) % data.users.length];
  let token = null;
  group("login", () => {
    const r = http.post(`${BASE}/auth/login`, JSON.stringify(user), {
      headers: { ...base, "content-type": "application/json" },
      tags: { kind: "login", name: "login" },
    });
    check(r, { "login 200": (x) => x.status === 200 });
    token = json(r)?.accessToken || null;
  });
  if (!token) return;
  const authed = { ...base, authorization: `Bearer ${token}`, "content-type": "application/json" };

  group("checkout", () => {
    // Moves the guest bag (signed cookie in the jar) onto the account.
    http.post(`${BASE}/cart/merge`, null, { headers: authed, tags: { kind: "write", name: "merge" } });
    http.get(`${BASE}/cart`, { headers: authed, tags: { kind: "read", name: "cart" } });
    http.get(`${BASE}/users/me/addresses`, { headers: authed, tags: { kind: "read", name: "addresses" } });
    pause(10, 25); // filling the address form
    const r = http.post(
      `${BASE}/orders/checkout`,
      JSON.stringify({
        contactEmail: user.email,
        paymentMethod: "COD",
        address: {
          fullName: "Load Tester",
          phone: "9876543210",
          line1: "12 Test Street",
          city: "Kochi",
          state: "Kerala",
          pincode: "682001",
        },
      }),
      {
        headers: authed,
        tags: { kind: "checkout", name: "checkout" },
        // 422 = bag under the 1 kg minimum: the business rule, not a failure.
        responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 422),
      },
    );
    if (check(r, { "checkout ok": (x) => x.status === 200 || x.status === 201 })) ordersPlaced.add(1);
  });
  journeyTime.add(Date.now() - started);
}
