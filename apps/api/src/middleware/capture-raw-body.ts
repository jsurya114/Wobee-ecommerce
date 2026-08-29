import type { IncomingMessage } from "node:http";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The exact raw request body bytes, captured before JSON parsing — see this file's own header comment for why. */
      rawBody?: Buffer;
    }
  }
}

/**
 * Passed as `express.json()`'s `verify` option in app.ts. Razorpay's
 * webhook signature (ADR-014) is an HMAC over the EXACT bytes it sent —
 * once `express.json()` parses and Express re-serializes that into
 * `req.body`, those bytes are gone, and re-stringifying `req.body` later
 * would not reproduce them byte-for-byte (key order, whitespace).
 *
 * The naive fix — mount a second, route-specific `express.raw()` on just
 * the webhook route — does NOT work here: `express.json()` is already
 * mounted globally in app.ts (every module needs it), so it always runs
 * first and fully drains the request stream before a later per-route raw
 * parser would ever see it. This `verify` callback is the standard fix:
 * it runs on the raw bytes DURING express.json()'s own parsing, before
 * JSON.parse touches them, so both `req.body` (for every other route) and
 * `req.rawBody` (for the one route that needs the original bytes) come out
 * of the same single parse.
 *
 * Typed against `IncomingMessage` (not Express's `Request`) because that's
 * body-parser's own `verify` callback signature — at runtime this is always
 * the real Express `Request` object, so attaching `rawBody` here is exactly
 * what the `Request` augmentation above types for every other file.
 */
export function captureRawBody(req: IncomingMessage, _res: unknown, buf: Buffer): void {
  (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
}
