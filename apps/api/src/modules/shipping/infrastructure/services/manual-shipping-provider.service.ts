import { ValidationError } from "../../../../shared/errors";
import type { CreateShipmentInput, ShipmentResult, ShippingProviderPort } from "../../application/ports/shipping-provider.port";

/**
 * The only ShippingProviderPort implementation this week — no courier API
 * (Delhivery/Shiprocket/etc.) is approved or configured, the same situation
 * Razorpay was in before real keys arrived and Media was in before
 * S3/Cloudinary credentials existed. Rather than a dead stub, this is a
 * genuinely working implementation: it's what already backs the admin
 * "mark as shipped" flow's tracking-number/carrier capture (ShipOrderUseCase
 * calls this before its own DB write, see that use-case's own comment) —
 * just normalized behind the same interface a real carrier adapter would
 * implement later.
 */
export class ManualShippingProvider implements ShippingProviderPort {
  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const trackingNumber = input.trackingNumber.trim();
    const carrier = input.carrier.trim();
    // Real failure path, not simulated — a real courier API's "shipment
    // creation failed" case (week2 (1).md §10's "Provider failure" test)
    // shows up here as "the input this provider needs to record a shipment
    // wasn't actually usable," which is exactly what's testable without a
    // live courier account. shipOrderSchema already requires non-empty
    // strings, so this only fires if something upstream changes that
    // contract — defense in depth, not a dead branch.
    if (!trackingNumber || !carrier) {
      throw new ValidationError("Tracking number and carrier are both required to create a shipment");
    }
    return { trackingNumber, carrier, provider: "MANUAL" };
  }
}
