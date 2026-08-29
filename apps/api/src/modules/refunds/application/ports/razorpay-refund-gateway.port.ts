export interface RazorpayRefundResult {
  id: string;
  status: string;
}

export interface RazorpayRefundGatewayPort {
  refundPayment(razorpayPaymentId: string, amountPaise: number): Promise<RazorpayRefundResult>;
}
