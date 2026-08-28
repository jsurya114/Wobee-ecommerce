import type { AddressEntity } from "../../../users/domain/entities/address.entity";
import type { CustomerSummary } from "../../../auth/application/ports/auth-repository.port";
import type { OrderSummaryEntity } from "../../../orders/domain/entities/order.entity";

export interface CustomerActivitySummary {
  orderCount: number;
  totalSpentPaise: number;
  lastOrderAt: Date | null;
}

export interface CustomerDetailView {
  customer: CustomerSummary;
  orders: OrderSummaryEntity[];
  addresses: AddressEntity[];
  activity: CustomerActivitySummary;
}

/**
 * week2 (1).md §19's admin customer detail — "Orders", "Addresses where
 * authorized", "Basic activity" in one view. Composed here, in `admin`,
 * not in `auth` (which owns User): this needs `orders` and `users`
 * (Address) too, and `users` already imports `auth` (its profile-edit
 * endpoint reuses `updateUserProfileUseCase`) — an `auth -> users` edge
 * back would close that cycle. `admin` sits above all three and is
 * imported by nothing, so composing here adds no edge that can lead back,
 * same reasoning CancelOrderWithRefundUseCase's own doc comment gives for
 * why IT lives here instead of in `orders`.
 *
 * "Basic activity" is derived from the orders list already being fetched
 * here, not a separate aggregate query — order count, total spent (sum of
 * every fetched order's own totalPaise, cancelled orders included: this is
 * "activity", not a revenue figure that would need to exclude them), and
 * the most recent placedAt.
 */
export class GetCustomerDetailUseCase {
  constructor(
    private readonly getCustomerForAdmin: { execute(userId: string): Promise<CustomerSummary> },
    private readonly orderReader: { listForUser(userId: string): Promise<OrderSummaryEntity[]> },
    private readonly addressReader: { listForUser(userId: string): Promise<AddressEntity[]> },
  ) {}

  async execute(userId: string): Promise<CustomerDetailView> {
    const customer = await this.getCustomerForAdmin.execute(userId);
    const [orders, addresses] = await Promise.all([this.orderReader.listForUser(userId), this.addressReader.listForUser(userId)]);

    const activity: CustomerActivitySummary = {
      orderCount: orders.length,
      totalSpentPaise: orders.reduce((sum, order) => sum + order.totalPaise, 0),
      lastOrderAt: orders.length > 0 ? orders.reduce((latest, order) => (order.placedAt > latest ? order.placedAt : latest), orders[0]!.placedAt) : null,
    };

    return { customer, orders, addresses, activity };
  }
}
