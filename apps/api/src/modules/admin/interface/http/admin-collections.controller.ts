import type {
  AssignCollectionProductInput,
  CreateCollectionInput,
  ReorderCollectionProductsInput,
  SetCollectionActiveInput,
  UpdateCollectionInput,
} from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { AssignCollectionProductUseCase } from "../../../collections/application/use-cases/admin/assign-collection-product.use-case";
import type { CreateCollectionUseCase } from "../../../collections/application/use-cases/admin/create-collection.use-case";
import type { GetCollectionAdminUseCase } from "../../../collections/application/use-cases/admin/get-collection-admin.use-case";
import type { ListCollectionsAdminUseCase } from "../../../collections/application/use-cases/admin/list-collections-admin.use-case";
import type { RemoveCollectionProductUseCase } from "../../../collections/application/use-cases/admin/remove-collection-product.use-case";
import type { ReorderCollectionProductsUseCase } from "../../../collections/application/use-cases/admin/reorder-collection-products.use-case";
import type { SetCollectionActiveUseCase } from "../../../collections/application/use-cases/admin/set-collection-active.use-case";
import type { UpdateCollectionUseCase } from "../../../collections/application/use-cases/admin/update-collection.use-case";

/** Thin permission-gated HTTP gateway onto the collections module's own exported use-cases (ADR-025) — same shape as AdminOrdersController. */
export class AdminCollectionsController {
  constructor(
    private readonly listCollectionsAdminUseCase: ListCollectionsAdminUseCase,
    private readonly getCollectionAdminUseCase: GetCollectionAdminUseCase,
    private readonly createCollectionUseCase: CreateCollectionUseCase,
    private readonly updateCollectionUseCase: UpdateCollectionUseCase,
    private readonly setCollectionActiveUseCase: SetCollectionActiveUseCase,
    private readonly assignCollectionProductUseCase: AssignCollectionProductUseCase,
    private readonly removeCollectionProductUseCase: RemoveCollectionProductUseCase,
    private readonly reorderCollectionProductsUseCase: ReorderCollectionProductsUseCase,
  ) {}

  async list(_req: Request, res: Response): Promise<void> {
    const collections = await this.listCollectionsAdminUseCase.execute();
    res.status(200).json({ collections });
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const collection = await this.getCollectionAdminUseCase.execute(requireId(req));
    res.status(200).json({ collection });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateCollectionInput;
    const collection = await this.createCollectionUseCase.execute(input);
    res.status(201).json({ collection });
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdateCollectionInput;
    const collection = await this.updateCollectionUseCase.execute(requireId(req), input);
    res.status(200).json({ collection });
  }

  async setActive(req: Request, res: Response): Promise<void> {
    const input = req.body as SetCollectionActiveInput;
    const collection = await this.setCollectionActiveUseCase.execute(requireId(req), input.isActive);
    res.status(200).json({ collection });
  }

  async assignProduct(req: Request, res: Response): Promise<void> {
    const input = req.body as AssignCollectionProductInput;
    await this.assignCollectionProductUseCase.execute(requireId(req), input.productId);
    res.status(204).send();
  }

  async removeProduct(req: Request, res: Response): Promise<void> {
    const productId = req.params.productId;
    if (!productId || typeof productId !== "string") {
      throw new ValidationError("Product id is required");
    }
    await this.removeCollectionProductUseCase.execute(requireId(req), productId);
    res.status(204).send();
  }

  async reorderProducts(req: Request, res: Response): Promise<void> {
    const input = req.body as ReorderCollectionProductsInput;
    await this.reorderCollectionProductsUseCase.execute(requireId(req), input.productIds);
    res.status(204).send();
  }
}

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Collection id is required");
  }
  return id;
}
