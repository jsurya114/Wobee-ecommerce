import type {
  AddProductImageInput,
  CreateProductInput,
  CreateVariantInput,
  ListProductsAdminQuery,
  ReorderProductImagesInput,
  SetProductActiveInput,
  SetVariantActiveInput,
  UpdateProductInput,
  UpdateVariantInput,
} from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { AddProductImageUseCase } from "../../../products/application/use-cases/admin/add-product-image.use-case";
import type { CreateProductUseCase } from "../../../products/application/use-cases/admin/create-product.use-case";
import type { CreateProductVariantUseCase } from "../../../products/application/use-cases/admin/create-product-variant.use-case";
import type { GetProductAdminUseCase } from "../../../products/application/use-cases/admin/get-product-admin.use-case";
import type { ListProductsAdminUseCase } from "../../../products/application/use-cases/admin/list-products-admin.use-case";
import type { RemoveProductImageUseCase } from "../../../products/application/use-cases/admin/remove-product-image.use-case";
import type { ReorderProductImagesUseCase } from "../../../products/application/use-cases/admin/reorder-product-images.use-case";
import type { SetProductActiveUseCase } from "../../../products/application/use-cases/admin/set-product-active.use-case";
import type { SetProductVariantActiveUseCase } from "../../../products/application/use-cases/admin/set-product-variant-active.use-case";
import type { UpdateProductUseCase } from "../../../products/application/use-cases/admin/update-product.use-case";
import type { UpdateProductVariantUseCase } from "../../../products/application/use-cases/admin/update-product-variant.use-case";

/** Thin permission-gated HTTP gateway onto the products module's own exported use-cases (ADR-025) — same shape as AdminCollectionsController/AdminReturnsController. */
export class AdminProductsController {
  constructor(
    private readonly listProductsAdminUseCase: ListProductsAdminUseCase,
    private readonly getProductAdminUseCase: GetProductAdminUseCase,
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly updateProductUseCase: UpdateProductUseCase,
    private readonly setProductActiveUseCase: SetProductActiveUseCase,
    private readonly createProductVariantUseCase: CreateProductVariantUseCase,
    private readonly updateProductVariantUseCase: UpdateProductVariantUseCase,
    private readonly setProductVariantActiveUseCase: SetProductVariantActiveUseCase,
    private readonly addProductImageUseCase: AddProductImageUseCase,
    private readonly removeProductImageUseCase: RemoveProductImageUseCase,
    private readonly reorderProductImagesUseCase: ReorderProductImagesUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListProductsAdminQuery;
    const result = await this.listProductsAdminUseCase.execute(query);
    res.status(200).json(result);
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const product = await this.getProductAdminUseCase.execute(requireId(req));
    res.status(200).json({ product });
  }

  async create(req: Request, res: Response): Promise<void> {
    const product = await this.createProductUseCase.execute(req.body as CreateProductInput);
    res.status(201).json({ product });
  }

  async update(req: Request, res: Response): Promise<void> {
    const product = await this.updateProductUseCase.execute(requireId(req), req.body as UpdateProductInput);
    res.status(200).json({ product });
  }

  async setActive(req: Request, res: Response): Promise<void> {
    const input = req.body as SetProductActiveInput;
    const product = await this.setProductActiveUseCase.execute(requireId(req), input.isActive);
    res.status(200).json({ product });
  }

  async createVariant(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateVariantInput;
    const variant = await this.createProductVariantUseCase.execute(requireId(req), input);
    res.status(201).json({ variant });
  }

  async updateVariant(req: Request, res: Response): Promise<void> {
    const variant = await this.updateProductVariantUseCase.execute(requireVariantId(req), req.body as UpdateVariantInput);
    res.status(200).json({ variant });
  }

  async setVariantActive(req: Request, res: Response): Promise<void> {
    const input = req.body as SetVariantActiveInput;
    const variant = await this.setProductVariantActiveUseCase.execute(requireVariantId(req), input.isActive);
    res.status(200).json({ variant });
  }

  async addImage(req: Request, res: Response): Promise<void> {
    const input = req.body as AddProductImageInput;
    const image = await this.addProductImageUseCase.execute(requireId(req), input.url, input.altText);
    res.status(201).json({ image });
  }

  async removeImage(req: Request, res: Response): Promise<void> {
    const imageId = req.params.imageId;
    if (!imageId || typeof imageId !== "string") {
      throw new ValidationError("Image id is required");
    }
    await this.removeProductImageUseCase.execute(requireId(req), imageId);
    res.status(204).send();
  }

  async reorderImages(req: Request, res: Response): Promise<void> {
    const input = req.body as ReorderProductImagesInput;
    await this.reorderProductImagesUseCase.execute(requireId(req), input.imageIds);
    res.status(204).send();
  }
}

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Product id is required");
  }
  return id;
}

function requireVariantId(req: Request): string {
  const id = req.params.variantId;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Variant id is required");
  }
  return id;
}
