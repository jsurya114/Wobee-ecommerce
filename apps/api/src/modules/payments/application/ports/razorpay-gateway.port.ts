export interface RazorpayOrder {
  id: string;
  amountPaise: number;
  currency: string;
}

/**
 * application depends on this interface, not on the `razorpay` SDK
 * directly — the infrastructure layer implements it. `verifyWebhookSignature`
 * is ADR-014's authoritative check: never trust the client-redirect success
 * callback alone, only a signature-verified webhook confirms a payment.
 */
export interface RazorpayGatewayPort {
  createOrder(input: { amountPaise: number; receipt: string }): Promise<RazorpayOrder>;
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean;
}
