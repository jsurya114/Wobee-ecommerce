import type { CreateShipmentInput, ShipmentResult, ShippingProviderPort } from "../ports/shipping-provider.port";

/** week2 (1).md §10's `ShippingService.createShipment()` — exported for `orders`' ShipOrderUseCase to call through a port (same cross-module pattern as evaluateShippingUseCase). */
export class CreateShipmentUseCase {
  constructor(private readonly shippingProvider: ShippingProviderPort) {}

  execute(input: CreateShipmentInput): Promise<ShipmentResult> {
    return this.shippingProvider.createShipment(input);
  }
}
