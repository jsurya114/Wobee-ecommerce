// Composition root for the shipping module (ARCHITECTURE.md §3.2). ADR-021's
// weight thresholds and fee are read live from ShippingRule here — never
// hardcoded, never computed client-side.
//
// Week 2 Day 5 (week2 (1).md §10) gives this module its first real HTTP
// surface (GET /shipping/estimate, public) and its first provider port
// (ShippingProviderPort / ManualShippingProvider, createShipment) —
// evaluateShippingUseCase's in-process consumers (cart, orders) are
// unchanged.
import { EvaluateShippingUseCase } from "./application/use-cases/evaluate-shipping.use-case";
import { CreateShipmentUseCase } from "./application/use-cases/create-shipment.use-case";
import { GetShippingEstimateUseCase } from "./application/use-cases/get-shipping-estimate.use-case";
import { ManualShippingProvider } from "./infrastructure/services/manual-shipping-provider.service";
import { ShippingRepository } from "./infrastructure/repositories/shipping.repository";
import { ShippingController } from "./interface/http/shipping.controller";
import { createShippingRouter } from "./interface/http/shipping.routes";

const shippingRepository = new ShippingRepository();
const shippingProvider = new ManualShippingProvider();

export const evaluateShippingUseCase = new EvaluateShippingUseCase(shippingRepository);
export const getShippingEstimateUseCase = new GetShippingEstimateUseCase(shippingRepository);
/** Exported for `orders`' ShipOrderUseCase (Week 2 Day 5) — see that use-case's own doc comment. */
export const createShipmentUseCase = new CreateShipmentUseCase(shippingProvider);

const shippingController = new ShippingController(getShippingEstimateUseCase);

export const router = createShippingRouter(shippingController);
