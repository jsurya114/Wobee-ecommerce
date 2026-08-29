import type { AdjustInventoryInput, ListInventoryAdminQuery } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { AdjustInventoryUseCase } from "../../../inventory/application/use-cases/adjust-inventory.use-case";
import type { ListInventoryAdminUseCase } from "../../../inventory/application/use-cases/list-inventory-admin.use-case";

/** Thin permission-gated HTTP gateway onto the inventory module's own exported use-cases (ADR-025). */
export class AdminInventoryController {
  constructor(
    private readonly listInventoryAdminUseCase: ListInventoryAdminUseCase,
    private readonly adjustInventoryUseCase: AdjustInventoryUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListInventoryAdminQuery;
    const result = await this.listInventoryAdminUseCase.execute(query);
    res.status(200).json(result);
  }

  async adjust(req: Request, res: Response): Promise<void> {
    const variantId = req.params.variantId;
    if (!variantId || typeof variantId !== "string") {
      throw new ValidationError("Variant id is required");
    }
    const input = req.body as AdjustInventoryInput;
    const result = await this.adjustInventoryUseCase.execute(variantId, input.delta, input.reason, req.user!);
    res.status(200).json(result);
  }
}
