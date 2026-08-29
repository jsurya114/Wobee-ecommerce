import type { ListCustomersQuery, SetCustomerActiveInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { ListCustomersAdminUseCase } from "../../../auth/application/use-cases/list-customers-admin.use-case";
import type { SetCustomerActiveUseCase } from "../../../auth/application/use-cases/set-customer-active.use-case";
import type { GetCustomerDetailUseCase } from "../../application/use-cases/get-customer-detail.use-case";

/** Thin permission-gated HTTP gateway onto auth's/admin's own exported use-cases (ADR-025) — same shape as every other admin controller this week. */
export class AdminCustomersController {
  constructor(
    private readonly listCustomersAdminUseCase: ListCustomersAdminUseCase,
    private readonly getCustomerDetailUseCase: GetCustomerDetailUseCase,
    private readonly setCustomerActiveUseCase: SetCustomerActiveUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListCustomersQuery;
    const result = await this.listCustomersAdminUseCase.execute(query);
    res.status(200).json(result);
  }

  async getOne(req: Request, res: Response): Promise<void> {
    // GetCustomerDetailUseCase already confirms the id is a real customer
    // (via GetCustomerForAdminUseCase internally) before assembling the
    // rest of the cross-module view — no need to duplicate that check here.
    const detail = await this.getCustomerDetailUseCase.execute(requireId(req));
    res.status(200).json(detail);
  }

  async setActive(req: Request, res: Response): Promise<void> {
    const input = req.body as SetCustomerActiveInput;
    const customer = await this.setCustomerActiveUseCase.execute(requireId(req), input.isActive);
    res.status(200).json({ customer });
  }
}

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Customer id is required");
  }
  return id;
}
