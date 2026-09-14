import type { CreateOfferInput, SetOfferActiveInput, UpdateOfferInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { CreateOfferUseCase } from "../../../offers/application/use-cases/admin/create-offer.use-case";
import type { GetOfferAdminUseCase } from "../../../offers/application/use-cases/admin/get-offer-admin.use-case";
import type { ListOffersAdminUseCase } from "../../../offers/application/use-cases/admin/list-offers-admin.use-case";
import type { SetOfferActiveUseCase } from "../../../offers/application/use-cases/admin/set-offer-active.use-case";
import type { UpdateOfferUseCase } from "../../../offers/application/use-cases/admin/update-offer.use-case";

/** Thin permission-gated HTTP gateway onto the offers module's own exported use-cases (ADR-025) — same shape as AdminCouponsController. */
export class AdminOffersController {
  constructor(
    private readonly listOffersAdminUseCase: ListOffersAdminUseCase,
    private readonly getOfferAdminUseCase: GetOfferAdminUseCase,
    private readonly createOfferUseCase: CreateOfferUseCase,
    private readonly updateOfferUseCase: UpdateOfferUseCase,
    private readonly setOfferActiveUseCase: SetOfferActiveUseCase,
  ) {}

  async list(_req: Request, res: Response): Promise<void> {
    const offers = await this.listOffersAdminUseCase.execute();
    res.status(200).json({ offers });
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const offer = await this.getOfferAdminUseCase.execute(requireId(req));
    res.status(200).json({ offer });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateOfferInput;
    const offer = await this.createOfferUseCase.execute(input);
    res.status(201).json({ offer });
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdateOfferInput;
    const offer = await this.updateOfferUseCase.execute(requireId(req), input);
    res.status(200).json({ offer });
  }

  async setActive(req: Request, res: Response): Promise<void> {
    const input = req.body as SetOfferActiveInput;
    const offer = await this.setOfferActiveUseCase.execute(requireId(req), input.isActive);
    res.status(200).json({ offer });
  }
}

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Offer id is required");
  }
  return id;
}
