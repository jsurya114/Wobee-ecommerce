import type { ListMyReturnsQuery, RequestReturnInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { GetReturnUseCase } from "../../application/use-cases/get-return.use-case";
import type { ListMyReturnsUseCase } from "../../application/use-cases/list-my-returns.use-case";
import type { RequestReturnUseCase } from "../../application/use-cases/request-return.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class ReturnsController {
  constructor(
    private readonly requestReturnUseCase: RequestReturnUseCase,
    private readonly listMyReturnsUseCase: ListMyReturnsUseCase,
    private readonly getReturnUseCase: GetReturnUseCase,
  ) {}

  async requestReturn(req: Request, res: Response): Promise<void> {
    const input = req.body as RequestReturnInput;
    const created = await this.requestReturnUseCase.execute({ orderId: input.orderId, userId: req.user!.id, reason: input.reason, items: input.items });
    res.status(201).json(created);
  }

  async listMine(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListMyReturnsQuery;
    const returns = await this.listMyReturnsUseCase.execute(req.user!.id, query.orderId);
    res.status(200).json({ returns });
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const returnId = requireReturnId(req);
    const found = await this.getReturnUseCase.execute(returnId, req.user!.id);
    res.status(200).json(found);
  }
}

function requireReturnId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Return id is required");
  }
  return id;
}
