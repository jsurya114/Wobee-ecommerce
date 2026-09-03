import type { AdminDashboardQuery } from "@woobe/validation";
import type { Request, Response } from "express";
import type { GetAdminDashboardUseCase } from "../../application/use-cases/get-admin-dashboard.use-case";

/** Thin permission-gated HTTP gateway (ADR-025) — see GetAdminDashboardUseCase's own doc comment for where the actual composition happens. */
export class AdminAnalyticsController {
  constructor(private readonly getAdminDashboardUseCase: GetAdminDashboardUseCase) {}

  async getDashboard(req: Request, res: Response): Promise<void> {
    const { days } = req.query as unknown as AdminDashboardQuery;
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));

    const dashboard = await this.getAdminDashboardUseCase.execute({ from, to });
    res.status(200).json(dashboard);
  }
}
