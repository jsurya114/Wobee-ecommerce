import type { ChangeStaffRoleInput, CreateStaffInput, ListStaffQuery, SetStaffActiveInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { ChangeStaffRoleUseCase } from "../../../staff/application/use-cases/change-staff-role.use-case";
import type { CreateStaffUseCase } from "../../../staff/application/use-cases/create-staff.use-case";
import type { GetStaffDetailUseCase } from "../../../staff/application/use-cases/get-staff-detail.use-case";
import type { ListStaffUseCase } from "../../../staff/application/use-cases/list-staff.use-case";
import type { ResendStaffInvitationUseCase } from "../../../staff/application/use-cases/resend-staff-invitation.use-case";
import type { SetStaffActiveUseCase } from "../../../staff/application/use-cases/set-staff-active.use-case";

/** Thin permission-gated HTTP gateway onto the Staff module's own use-cases (ADR-025) — same shape as AdminCustomersController. MANAGE_STAFF is enforced at the router (admin-staff.routes.ts), not here. */
export class AdminStaffController {
  constructor(
    private readonly createStaffUseCase: CreateStaffUseCase,
    private readonly listStaffUseCase: ListStaffUseCase,
    private readonly getStaffDetailUseCase: GetStaffDetailUseCase,
    private readonly changeStaffRoleUseCase: ChangeStaffRoleUseCase,
    private readonly setStaffActiveUseCase: SetStaffActiveUseCase,
    private readonly resendStaffInvitationUseCase: ResendStaffInvitationUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListStaffQuery;
    const items = await this.listStaffUseCase.execute(query);
    res.status(200).json({ items });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateStaffInput;
    const result = await this.createStaffUseCase.execute(req.user!, input);
    res.status(201).json({
      staff: result.staff,
      invitationExpiresAt: result.invitationExpiresAt.toISOString(),
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const staff = await this.getStaffDetailUseCase.execute(requireId(req));
    res.status(200).json({ staff });
  }

  async changeRole(req: Request, res: Response): Promise<void> {
    const input = req.body as ChangeStaffRoleInput;
    const staff = await this.changeStaffRoleUseCase.execute(req.user!, requireId(req), input.role);
    res.status(200).json({ staff });
  }

  async setActive(req: Request, res: Response): Promise<void> {
    const input = req.body as SetStaffActiveInput;
    const staff = await this.setStaffActiveUseCase.execute(req.user!, requireId(req), input.isActive);
    res.status(200).json({ staff });
  }

  async resendInvitation(req: Request, res: Response): Promise<void> {
    const result = await this.resendStaffInvitationUseCase.execute(req.user!, requireId(req));
    res.status(200).json({
      pending: true,
      expiresAt: result.expiresAt.toISOString(),
      ...(result.devCode ? { devCode: result.devCode } : {}),
    });
  }
}

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Staff id is required");
  }
  return id;
}
