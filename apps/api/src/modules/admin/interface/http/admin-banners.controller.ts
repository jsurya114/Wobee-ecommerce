import type { CreateBannerInput, ReorderBannersInput, SetBannerActiveInput, UpdateBannerInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { CreateBannerUseCase } from "../../../banners/application/use-cases/admin/create-banner.use-case";
import type { DeleteBannerUseCase } from "../../../banners/application/use-cases/admin/delete-banner.use-case";
import type { GetBannerAdminUseCase } from "../../../banners/application/use-cases/admin/get-banner-admin.use-case";
import type { ListBannersAdminUseCase } from "../../../banners/application/use-cases/admin/list-banners-admin.use-case";
import type { ReorderBannersUseCase } from "../../../banners/application/use-cases/admin/reorder-banners.use-case";
import type { SetBannerActiveUseCase } from "../../../banners/application/use-cases/admin/set-banner-active.use-case";
import type { UpdateBannerUseCase } from "../../../banners/application/use-cases/admin/update-banner.use-case";

/** Thin permission-gated HTTP gateway onto the banners module's own exported use-cases (ADR-025) — same shape as AdminCollectionsController. */
export class AdminBannersController {
  constructor(
    private readonly listBannersAdminUseCase: ListBannersAdminUseCase,
    private readonly getBannerAdminUseCase: GetBannerAdminUseCase,
    private readonly createBannerUseCase: CreateBannerUseCase,
    private readonly updateBannerUseCase: UpdateBannerUseCase,
    private readonly setBannerActiveUseCase: SetBannerActiveUseCase,
    private readonly deleteBannerUseCase: DeleteBannerUseCase,
    private readonly reorderBannersUseCase: ReorderBannersUseCase,
  ) {}

  async list(_req: Request, res: Response): Promise<void> {
    const banners = await this.listBannersAdminUseCase.execute();
    res.status(200).json({ banners });
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const banner = await this.getBannerAdminUseCase.execute(requireId(req));
    res.status(200).json({ banner });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateBannerInput;
    const banner = await this.createBannerUseCase.execute(input);
    res.status(201).json({ banner });
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdateBannerInput;
    const banner = await this.updateBannerUseCase.execute(requireId(req), input);
    res.status(200).json({ banner });
  }

  async setActive(req: Request, res: Response): Promise<void> {
    const input = req.body as SetBannerActiveInput;
    const banner = await this.setBannerActiveUseCase.execute(requireId(req), input.isActive);
    res.status(200).json({ banner });
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.deleteBannerUseCase.execute(requireId(req));
    res.status(204).send();
  }

  async reorder(req: Request, res: Response): Promise<void> {
    const input = req.body as ReorderBannersInput;
    await this.reorderBannersUseCase.execute(input.bannerIds);
    res.status(204).send();
  }
}

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Banner id is required");
  }
  return id;
}
