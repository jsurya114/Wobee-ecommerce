import { describe, expect, it, vi } from "vitest";
import type { AddressEntity } from "../../domain/entities/address.entity";
import type { AddressRepositoryPort } from "../ports/address-repository.port";
import { CreateAddressUseCase } from "./create-address.use-case";
import { SaveCheckoutAddressUseCase } from "./save-checkout-address.use-case";

const CHECKOUT_ADDRESS = {
  fullName: "Asha Rao",
  phone: "9876543210",
  line1: "123 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

function savedAddress(overrides: Partial<AddressEntity> = {}): AddressEntity {
  return {
    id: "addr-1",
    userId: "user-1",
    fullName: "Asha Rao",
    phone: "9876543210",
    line1: "123 Test Street",
    line2: null,
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    isDefault: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function build(existing: AddressEntity[] = []) {
  const addressRepository = {
    findAllForUser: vi.fn().mockResolvedValue(existing),
    findByIdForUser: vi.fn(),
    countForUser: vi.fn().mockResolvedValue(existing.length),
    create: vi.fn().mockImplementation((_userId, fields, isDefault) =>
      Promise.resolve(savedAddress({ ...fields, line2: fields.line2 ?? null, isDefault })),
    ),
    update: vi.fn(),
    deleteAndListRemaining: vi.fn(),
    setDefault: vi.fn(),
  } as unknown as AddressRepositoryPort;
  const createAddressUseCase = new CreateAddressUseCase(addressRepository);
  const useCase = new SaveCheckoutAddressUseCase(addressRepository, createAddressUseCase);
  return { useCase, addressRepository };
}

describe("SaveCheckoutAddressUseCase", () => {
  it("saves the address (as non-default) when the user has no saved addresses matching it, reusing CreateAddressUseCase's first-address-is-default rule", async () => {
    const { useCase, addressRepository } = build([]);

    await useCase.execute("user-1", CHECKOUT_ADDRESS);

    expect(addressRepository.create).toHaveBeenCalledTimes(1);
    // First address ever for this user -> CreateAddressUseCase promotes it to
    // default regardless of the isDefault:false this use-case always passes.
    expect(addressRepository.create).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ fullName: "Asha Rao", pincode: "560001" }),
      true,
    );
  });

  it("does nothing when an identical address (exact match) already exists", async () => {
    const { useCase, addressRepository } = build([savedAddress()]);

    await useCase.execute("user-1", CHECKOUT_ADDRESS);

    expect(addressRepository.create).not.toHaveBeenCalled();
  });

  it("treats whitespace/case differences as the same address (trim + case-insensitive)", async () => {
    const { useCase, addressRepository } = build([savedAddress()]);

    await useCase.execute("user-1", {
      ...CHECKOUT_ADDRESS,
      fullName: "  ASHA RAO  ",
      city: "bengaluru",
      state: "KARNATAKA",
    });

    expect(addressRepository.create).not.toHaveBeenCalled();
  });

  it("treats a missing line2 and an empty-string line2 as equivalent", async () => {
    const { useCase, addressRepository } = build([savedAddress({ line2: "" })]);

    await useCase.execute("user-1", CHECKOUT_ADDRESS); // no line2 at all

    expect(addressRepository.create).not.toHaveBeenCalled();
  });

  it("saves a new (non-default) address when a saved one differs, without touching the existing default", async () => {
    const { useCase, addressRepository } = build([savedAddress({ isDefault: true })]);

    await useCase.execute("user-1", { ...CHECKOUT_ADDRESS, line1: "456 Another Road", city: "Mumbai", pincode: "400001" });

    expect(addressRepository.create).toHaveBeenCalledTimes(1);
    // A second address for this user (countForUser reflects the one existing
    // above) -> CreateAddressUseCase respects the requested isDefault:false.
    expect(addressRepository.create).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ line1: "456 Another Road" }),
      false,
    );
  });
});
