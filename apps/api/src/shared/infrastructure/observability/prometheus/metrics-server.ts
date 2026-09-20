import http from "node:http";
import type { Registry } from "@prometheus-io/client";

/**
 * A tiny standalone HTTP server exposing ONE route, `GET /metrics`, for a
 * process that has no Express app (the BullMQ worker). Node's own `http`
 * module — no framework, no extra dependency.
 *
 * Bind address is the caller's decision but the default everywhere in this
 * repo is loopback: the worker runs `--network host`, so binding anywhere
 * else would put its metrics on the instance's network interface. The
 * security group has no rule for this port either, and Prometheus (same
 * host) scrapes it over 127.0.0.1.
 *
 * Reads only the in-process Registry (plus whatever the registry's own
 * `collect()` hooks do — for the worker, one bounded Redis count call).
 */
export function startMetricsServer(options: { registry: Registry; host: string; port: number }): Promise<http.Server> {
  const { registry, host, port } = options;

  const server = http.createServer((req, res) => {
    // Path only — a query string must not change routing.
    const path = (req.url ?? "").split("?")[0];
    if ((req.method !== "GET" && req.method !== "HEAD") || path !== "/metrics") {
      res.statusCode = 404;
      res.end();
      return;
    }
    registry
      .metrics()
      .then((body) => {
        res.setHeader("Content-Type", registry.contentType);
        res.end(req.method === "HEAD" ? undefined : body);
      })
      .catch(() => {
        res.statusCode = 500;
        res.end();
      });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
