import { checkPincodeServiceability } from "../../domain/resolve-shipping";
import type { ShippingRepositoryPort } from "../ports/shipping-repository.port";

export interface ShippingEstimateResult {
  serviceable: boolean;
  reason?: string;
  estimatedDeliveryDaysMin?: number;
  estimatedDeliveryDaysMax?: number;
}

/** week2 (1).md §10's `ShippingService.getEstimate()` — the customer-facing "can you deliver here, and how long" check. */
export class GetShippingEstimateUseCase {
  constructor(private readonly shippingRepository: ShippingRepositoryPort) {}

  async execute(pincode: string): Promise<ShippingEstimateResult> {
    const serviceability = checkPincodeServiceability(pincode);
    if (!serviceability.serviceable) {
      return serviceability;
    }
    const rule = await this.shippingRepository.findCurrentRule();
    return {
      serviceable: true,
      estimatedDeliveryDaysMin: rule.estimatedDeliveryDaysMin,
      estimatedDeliveryDaysMax: rule.estimatedDeliveryDaysMax,
    };
  }
}
