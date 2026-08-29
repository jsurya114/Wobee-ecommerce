import type { ShippingEstimateQuery } from "@woobe/validation";
import type { Request, Response } from "express";
import type { GetShippingEstimateUseCase } from "../../application/use-cases/get-shipping-estimate.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class ShippingController {
  constructor(private readonly getShippingEstimateUseCase: GetShippingEstimateUseCase) {}

  async getEstimate(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ShippingEstimateQuery;
    const result = await this.getShippingEstimateUseCase.execute(query.pincode);
    res.status(200).json(result);
  }
}
