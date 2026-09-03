import type { CreateCouponInput, SetCouponActiveInput, UpdateCouponInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { CreateCouponUseCase } from "../../../coupons/application/use-cases/admin/create-coupon.use-case";
import type { DeleteCouponUseCase } from "../../../coupons/application/use-cases/admin/delete-coupon.use-case";
import type { GetCouponAdminUseCase } from "../../../coupons/application/use-cases/admin/get-coupon-admin.use-case";
import type { ListCouponsAdminUseCase } from "../../../coupons/application/use-cases/admin/list-coupons-admin.use-case";
import type { SetCouponActiveUseCase } from "../../../coupons/application/use-cases/admin/set-coupon-active.use-case";
import type { UpdateCouponUseCase } from "../../../coupons/application/use-cases/admin/update-coupon.use-case";

/** Thin permission-gated HTTP gateway onto the coupons module's own exported use-cases (ADR-025) — same shape as AdminCategoriesController. */
export class AdminCouponsController {
  constructor(
    private readonly listCouponsAdminUseCase: ListCouponsAdminUseCase,
    private readonly getCouponAdminUseCase: GetCouponAdminUseCase,
    private readonly createCouponUseCase: CreateCouponUseCase,
    private readonly updateCouponUseCase: UpdateCouponUseCase,
    private readonly setCouponActiveUseCase: SetCouponActiveUseCase,
    private readonly deleteCouponUseCase: DeleteCouponUseCase,
  ) {}

  async list(_req: Request, res: Response): Promise<void> {
    const coupons = await this.listCouponsAdminUseCase.execute();
    res.status(200).json({ coupons });
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const coupon = await this.getCouponAdminUseCase.execute(requireId(req));
    res.status(200).json({ coupon });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateCouponInput;
    const coupon = await this.createCouponUseCase.execute(input);
    res.status(201).json({ coupon });
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdateCouponInput;
    const coupon = await this.updateCouponUseCase.execute(requireId(req), input);
    res.status(200).json({ coupon });
  }

  async setActive(req: Request, res: Response): Promise<void> {
    const input = req.body as SetCouponActiveInput;
    const coupon = await this.setCouponActiveUseCase.execute(requireId(req), input.isActive);
    res.status(200).json({ coupon });
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.deleteCouponUseCase.execute(requireId(req));
    res.status(204).send();
  }
}

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Coupon id is required");
  }
  return id;
}
