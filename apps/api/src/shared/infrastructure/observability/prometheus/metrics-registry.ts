import { collectDefaultMetrics, Registry } from "@prometheus-io/client";

/**
 * One process-wide, explicit Registry for the API process (never the
 * package's global default registry — an explicit instance is what makes
 * this testable: metric-definitions.test.ts constructs its own Registry per
 * test instead of accumulating state across the whole test run on a shared
 * global). The worker process is a SEPARATE Node.js process (worker.ts) and
 * gets its own separate Registry — see worker-metrics-registry.ts — metrics
 * cannot cross a process boundary in-memory, so there is no way to "share"
 * this one with it.
 *
 * `@prometheus-io/client` is the current official Prometheus Node.js
 * client — this package was previously published as `prom-client`, which
 * is now deprecated upstream in favour of this one; same maintainers
 * (prometheus/client_js), same API. Verified against the installed
 * package's own README/index.d.ts before writing any of this, not assumed
 * from older prom-client tutorials.
 */
export const registry = new Registry();

/**
 * Official Node.js/process defaults (event loop lag/utilization, heap,
 * GC, active handles, process CPU/uptime, Node version) — collected at
 * scrape time (registry.metrics()), not on an interval, per the package's
 * own documented behavior. Prefixed so every metric this app exports is
 * unambiguously namespaced, and so `woobe_node_*` reads as "Node.js runtime
 * metrics" at a glance in Grafana/PromQL, distinct from the
 * `woobe_http_*`/`woobe_orders_*`/etc. custom metrics in
 * metric-definitions.ts.
 */
collectDefaultMetrics({ register: registry, prefix: "woobe_node_" });
