import type { ConfirmCodOrderInput, CreateRazorpayOrderInput } from "@woobe/validation";
import type { Request, Response } from "express";
import type { ConfirmCodOrderUseCase } from "../../application/use-cases/confirm-cod-order.use-case";
import type { CreateRazorpayOrderUseCase } from "../../application/use-cases/create-razorpay-order.use-case";
import type { HandleRazorpayWebhookUseCase } from "../../application/use-cases/handle-razorpay-webhook.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class PaymentsController {
  constructor(
    private readonly createRazorpayOrderUseCase: CreateRazorpayOrderUseCase,
    private readonly confirmCodOrderUseCase: ConfirmCodOrderUseCase,
    private readonly handleRazorpayWebhookUseCase: HandleRazorpayWebhookUseCase,
  ) {}

  async createRazorpayOrder(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateRazorpayOrderInput;
    const config = await this.createRazorpayOrderUseCase.execute(input.orderId, req.user?.id);
    res.status(201).json(config);
  }

  async confirmCod(req: Request, res: Response): Promise<void> {
    const input = req.body as ConfirmCodOrderInput;
    const result = await this.confirmCodOrderUseCase.execute(input.orderId, req.user?.id);
    res.status(200).json(result);
  }

  /**
   * Deliberately never rejects with a non-2xx for anything short of a real
   * signature/verification failure (which DOES fail, via asyncHandler ->
   * error-handler, same as every other route) — "deduped"/"ignored"/
   * "amount-mismatch" are all legitimate outcomes Razorpay shouldn't retry
   * over (ADR-014).
   */
  async webhook(req: Request, res: Response): Promise<void> {
    const outcome = await this.handleRazorpayWebhookUseCase.execute({
      rawBody: req.rawBody,
      signature: req.headers["x-razorpay-signature"] as string | undefined,
      eventId: req.headers["x-razorpay-event-id"] as string | undefined,
      payload: req.body,
    });
    res.status(200).json(outcome);
  }
}
