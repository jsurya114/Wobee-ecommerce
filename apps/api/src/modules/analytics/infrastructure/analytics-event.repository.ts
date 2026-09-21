import { prisma } from "@woobe/database";
import type { AnalyticsEventRepositoryPort, NewAnalyticsEvent } from "../application/ports/analytics-event-repository.port";

export class AnalyticsEventRepository implements AnalyticsEventRepositoryPort {
  async record(event: NewAnalyticsEvent): Promise<boolean> {
    const result = await prisma.analyticsEvent.createMany({ data: [event], skipDuplicates: true });
    return result.count === 1;
  }
}
