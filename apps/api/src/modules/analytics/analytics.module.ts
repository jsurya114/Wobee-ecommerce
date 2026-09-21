// Composition root for the analytics module (ARCHITECTURE.md §3.2). Owns
// (ADR-010): AnalyticsEvent. Two faces: the PUBLIC first-party event collector
// (/api/v1/analytics/events, mounted via src/modules/index.ts) and the
// database-backed business dashboard use-case that apps/admin reads through
// admin.module.ts. Business analytics come from Postgres + these events —
// deliberately NOT from Prometheus, which stays operational-only.
import { GetBusinessDashboardUseCase } from "./application/use-cases/get-business-dashboard.use-case";
import { RecordAnalyticsEventUseCase } from "./application/use-cases/record-analytics-event.use-case";
import { AnalyticsEventRepository } from "./infrastructure/analytics-event.repository";
import { AnalyticsRepository } from "./infrastructure/analytics.repository";
import { AnalyticsController } from "./interface/http/analytics.controller";
import { createAnalyticsRouter } from "./interface/http/analytics.routes";

export const getBusinessDashboardUseCase = new GetBusinessDashboardUseCase(new AnalyticsRepository());
const recordAnalyticsEventUseCase = new RecordAnalyticsEventUseCase(new AnalyticsEventRepository());

export const router = createAnalyticsRouter(new AnalyticsController(recordAnalyticsEventUseCase));
