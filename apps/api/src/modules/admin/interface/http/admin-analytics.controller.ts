import type { AdminDashboardQuery } from "@woobe/validation";
import type { Request, Response } from "express";
import { InvalidDashboardRangeError } from "../../../analytics/domain/dashboard-period";
import type { GetBusinessDashboardUseCase } from "../../../analytics/application/use-cases/get-business-dashboard.use-case";
import { ValidationError } from "../../../../shared/errors";

/** Thin permission-gated HTTP gateway (ADR-025) — the actual composition, definitions and caching live in the analytics module's GetBusinessDashboardUseCase. */
export class AdminAnalyticsController {
  constructor(private readonly getBusinessDashboardUseCase: GetBusinessDashboardUseCase) {}

  async getDashboard(req: Request, res: Response): Promise<void> {
    const { range, from, to, compare } = req.query as unknown as AdminDashboardQuery;
    try {
      const dashboard = await this.getBusinessDashboardUseCase.execute({ range, from, to, compare });
      res.status(200).json(dashboard);
    } catch (error) {
      if (error instanceof InvalidDashboardRangeError) throw new ValidationError(error.message);
      throw error;
    }
  }
}
