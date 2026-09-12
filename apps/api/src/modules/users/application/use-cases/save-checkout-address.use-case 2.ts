import type { CheckoutAddressInput } from "@woobe/validation";
import type { AddressEntity } from "../../domain/entities/address.entity";
import type { AddressRepositoryPort } from "../ports/address-repository.port";
import { CreateAddressUseCase } from "./create-address.use-case";

/**
 * Normalizes one address field for equivalence comparison: trim + lowercase.
 * `line2`, `phone`, and `pincode` are already-normalized formats by the time
 * they reach here (indianPhone/pincode regexes in checkout.schema.ts), so
 * exact-after-trim is sufficient for them too — this one function covers
 * every field without needing per-field special-casing.
 */
function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isSameAddress(a: CheckoutAddressInput, b: AddressEntity): boolean {
  return (
    normalize(a.fullName) === normalize(b.fullName) &&
    normalize(a.phone) === normalize(b.phone) &&
    normalize(a.line1) === normalize(b.line1) &&
    normalize(a.line2) === normalize(b.line2) &&
    normalize(a.city) === normalize(b.city) &&
    normalize(a.state) === normalize(b.state) &&
    normalize(a.pincode) === normalize(b.pincode)
  );
}

/**
 * Checkout persists a customer's shipping address to their saved address
 * book (a convenience — "surprise, your last order's address is here for
 * next time"), but must never create a duplicate entry when the customer
 * re-uses the same address across orders. This use-case's only job is that
 * dedup-and-save decision: it reuses CreateAddressUseCase as-is for the
 * actual write (so the "first address becomes default" rule stays defined
 * in exactly one place, not duplicated here) rather than writing to
 * AddressRepositoryPort directly.
 *
 * Deliberately no-ops (does not throw, does not update) when a matching
 * address is already saved — that's the dedup behavior itself, not an
 * error case.
 */
export class SaveCheckoutAddressUseCase {
  constructor(
    private readonly addressRepository: AddressRepositoryPort,
    private readonly createAddressUseCase: CreateAddressUseCase,
  ) {}

  async execute(userId: string, address: CheckoutAddressInput): Promise<void> {
    const existing = await this.addressRepository.findAllForUser(userId);
    const alreadySaved = existing.some((candidate) => isSameAddress(address, candidate));
    if (alreadySaved) {
      return;
    }

    await this.createAddressUseCase.execute(userId, {
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      isDefault: false,
    });
  }
}
