import { calculateAverageOrderValuePaise } from "../../domain/calculate-average-order-value";
import type { AnalyticsDateRange, OrderAnalyticsView, OrderRepositoryPort } from "../ports/order-repository.port";

/** Admin analytics dashboard (2026-09-03) — exported for `admin`'s GetAdminDashboardUseCase (ADR-025: `admin` composes, never touches Prisma of its own). */
export class GetOrderAnalyticsUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  async execute(range: AnalyticsDateRange): Promise<OrderAnalyticsView> {
    const summary = await this.orderRepository.getOrderAnalytics(range);
    return { ...summary, averageOrderValuePaise: calculateAverageOrderValuePaise(summary.totalRevenuePaise, summary.orderCount) };
  }
}
