/**
 * How many reverse-proxy hops in front of the API Express should trust for
 * the client address (`app.set("trust proxy", n)`).
 *
 * Production runs behind exactly ONE proxy — nginx on the same host, which
 * OVERWRITES X-Forwarded-For with the client address it established from
 * Cloudflare's CF-Connecting-IP (infra/terraform/modules/ec2/templates/nginx).
 * Without this, `req.ip` is 127.0.0.1 for every request, and
 * `middleware/rate-limit.ts` (keyed by `req.ip`) would put ALL users into one
 * shared bucket: a few failed logins by anyone would lock everyone out.
 *
 * Elsewhere (local dev, tests) there is no proxy, so nothing is trusted — a
 * directly connected client must not be able to choose its own IP by sending
 * X-Forwarded-For. `TRUST_PROXY_HOPS` overrides either default explicitly.
 */
export function resolveTrustProxyHops(nodeEnv: string, configured: number | undefined): number {
  if (configured !== undefined) return configured;
  return nodeEnv === "production" ? 1 : 0;
}
