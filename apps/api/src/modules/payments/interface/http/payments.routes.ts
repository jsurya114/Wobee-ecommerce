import { confirmCodOrderSchema, createRazorpayOrderSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { optionalAuthGuard } from "../../../../middleware/optional-auth-guard";
import { validate } from "../../../../middleware/validate";
import type { PaymentsController } from "./payments.controller";

export function createPaymentsRouter(controller: PaymentsController): Router {
  const router = Router();

  // Guest or logged-in — same accessibility as the checkout endpoint that
  // creates the underlying order (ADR-011's pattern applied to payments).
  router.post(
    "/razorpay/orders",
    optionalAuthGuard,
    validate(createRazorpayOrderSchema),
    asyncHandler((req, res) => controller.createRazorpayOrder(req, res)),
  );
  router.post(
    "/cod/confirm",
    optionalAuthGuard,
    validate(confirmCodOrderSchema),
    asyncHandler((req, res) => controller.confirmCod(req, res)),
  );

  // No auth guard — Razorpay calls this directly. The signature check
  // inside the use-case IS the authentication (ADR-014); no session, no
  // access token, nothing Razorpay could even present.
  router.post(
    "/razorpay/webhook",
    asyncHandler((req, res) => controller.webhook(req, res)),
  );

  return router;
}
