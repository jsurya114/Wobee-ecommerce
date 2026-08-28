import type { ListReturnsQuery, RejectReturnInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { ApproveReturnUseCase } from "../../../returns/application/use-cases/approve-return.use-case";
import type { GetReturnForAdminUseCase } from "../../../returns/application/use-cases/get-return-for-admin.use-case";
import type { IssueRefundForApprovedReturnUseCase } from "../../../returns/application/use-cases/issue-refund-for-approved-return.use-case";
import type { ListReturnsForAdminUseCase } from "../../../returns/application/use-cases/list-returns-for-admin.use-case";
import type { MarkReturnRefundedUseCase } from "../../../returns/application/use-cases/mark-return-refunded.use-case";
import type { RejectReturnUseCase } from "../../../returns/application/use-cases/reject-return.use-case";

/** Thin permission-gated HTTP gateway onto the returns module's own exported use-cases (ADR-025) — same shape as AdminReviewsController/AdminCollectionsController. */
export class AdminReturnsController {
  constructor(
    private readonly listReturnsForAdminUseCase: ListReturnsForAdminUseCase,
    private readonly getReturnForAdminUseCase: GetReturnForAdminUseCase,
    private readonly approveReturnUseCase: ApproveReturnUseCase,
    private readonly rejectReturnUseCase: RejectReturnUseCase,
    private readonly issueRefundForApprovedReturnUseCase: IssueRefundForApprovedReturnUseCase,
    private readonly markReturnRefundedUseCase: MarkReturnRefundedUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListReturnsQuery;
    const result = await this.listReturnsForAdminUseCase.execute(query);
    res.status(200).json(result);
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const result = await this.getReturnForAdminUseCase.execute(requireReturnId(req));
    res.status(200).json(result);
  }

  async approve(req: Request, res: Response): Promise<void> {
    const result = await this.approveReturnUseCase.execute(requireReturnId(req), req.user!);
    res.status(200).json(result);
  }

  async reject(req: Request, res: Response): Promise<void> {
    const input = req.body as RejectReturnInput;
    const result = await this.rejectReturnUseCase.execute(requireReturnId(req), req.user!, input.reason);
    res.status(200).json(result);
  }

  async refund(req: Request, res: Response): Promise<void> {
    const result = await this.issueRefundForApprovedReturnUseCase.execute(requireReturnId(req), req.user!);
    res.status(200).json(result);
  }

  async markRefunded(req: Request, res: Response): Promise<void> {
    const result = await this.markReturnRefundedUseCase.execute(requireReturnId(req), req.user!);
    res.status(200).json(result);
  }
}

function requireReturnId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Return id is required");
  }
  return id;
}
