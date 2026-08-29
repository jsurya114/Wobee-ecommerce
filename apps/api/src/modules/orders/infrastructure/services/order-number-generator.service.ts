import { randomBytes } from "node:crypto";
import { generateOrderNumber } from "../../domain/order-number";
import type { OrderNumberGeneratorPort } from "../../application/ports/order-number-generator.port";

export class OrderNumberGeneratorService implements OrderNumberGeneratorPort {
  generate(): string {
    return generateOrderNumber(new Date(), randomBytes(6).toString("hex"));
  }
}
