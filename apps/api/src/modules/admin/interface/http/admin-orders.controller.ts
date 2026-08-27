import type { CancelOrderInput, ListOrdersQuery, ShipOrderInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { CancelOrderWithRefundUseCase } from "../../application/use-cases/cancel-order-with-refund.use-case";
import type { DeliverOrderUseCase } from "../../../orders/application/use-cases/deliver-order.use-case";
import type { GetOrderForAdminUseCase } from "../../../orders/application/use-cases/get-order-for-admin.use-case";
import type { ListOrdersUseCase } from "../../../orders/application/use-cases/list-orders.use-case";
import type { ShipOrderUseCase } from "../../../orders/application/use-cases/ship-order.use-case";
import type { StartProcessingOrderUseCase } from "../../../orders/application/use-cases/start-processing-order.use-case";

export class AdminOrdersController {
  constructor(
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly getOrderForAdminUseCase: GetOrderForAdminUseCase,
    private readonly startProcessingOrderUseCase: StartProcessingOrderUseCase,
    private readonly shipOrderUseCase: ShipOrderUseCase,
    private readonly deliverOrderUseCase: DeliverOrderUseCase,
    private readonly cancelOrderUseCase: CancelOrderWithRefundUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListOrdersQuery;
    const result = await this.listOrdersUseCase.execute(query);
    res.status(200).json(result);
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const order = await this.getOrderForAdminUseCase.execute(orderId);
    res.status(200).json(order);
  }

  async startProcessing(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const result = await this.startProcessingOrderUseCase.execute(orderId, req.user!);
    res.status(200).json(result.order);
  }

  async ship(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const input = req.body as ShipOrderInput;
    const result = await this.shipOrderUseCase.execute(orderId, req.user!, input);
    res.status(200).json(result.order);
  }

  async deliver(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const result = await this.deliverOrderUseCase.execute(orderId, req.user!);
    res.status(200).json(result.order);
  }

  async cancel(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const input = req.body as CancelOrderInput;
    const result = await this.cancelOrderUseCase.execute(orderId, req.user!, input.reason);
    res.status(200).json({ order: result.order, refundIssued: result.refundIssued });
  }
}

function requireOrderId(req: Request): string {
  const orderId = req.params.id;
  if (!orderId || typeof orderId !== "string") {
    throw new ValidationError("Order id is required");
  }
  return orderId;
}
