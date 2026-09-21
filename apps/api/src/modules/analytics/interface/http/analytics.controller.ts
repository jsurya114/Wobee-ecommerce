import type { AnalyticsEventInput } from "@woobe/validation";
import type { Request, Response } from "express";
import type { RecordAnalyticsEventUseCase } from "../../application/use-cases/record-analytics-event.use-case";

export class AnalyticsController {
  constructor(private readonly recordEventUseCase: RecordAnalyticsEventUseCase) {}

  async recordEvent(req: Request, res: Response): Promise<void> {
    await this.recordEventUseCase.execute(req.body as AnalyticsEventInput, req.user?.id ?? null);
    res.status(204).end();
  }
}
