import type { ActivateStaffInput, VerifyStaffInvitationInput } from "@woobe/validation";
import type { Request, Response } from "express";
import type { ActivateStaffUseCase } from "../../application/use-cases/activate-staff.use-case";
import type { VerifyStaffInvitationUseCase } from "../../application/use-cases/verify-staff-invitation.use-case";

/** Public, pre-auth surface — an invited staff member isn't logged in yet. Thin controller, same shape as AuthController's own OTP steps. */
export class StaffActivationController {
  constructor(
    private readonly verifyStaffInvitationUseCase: VerifyStaffInvitationUseCase,
    private readonly activateStaffUseCase: ActivateStaffUseCase,
  ) {}

  /** Step 1 — confirms the code without consuming it. 204; the client moves on to the "set password" screen. */
  async verify(req: Request, res: Response): Promise<void> {
    const input = req.body as VerifyStaffInvitationInput;
    await this.verifyStaffInvitationUseCase.execute(input);
    res.status(204).send();
  }

  /** Step 2 — verifies the code and sets the password. 204; the staff member logs in fresh afterwards. */
  async activate(req: Request, res: Response): Promise<void> {
    const input = req.body as ActivateStaffInput;
    await this.activateStaffUseCase.execute(input);
    res.status(204).send();
  }
}
