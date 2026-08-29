import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import type { HomeController } from "./home.controller";

export function createHomeRouter(controller: HomeController): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler((req, res) => controller.get(req, res)),
  );

  return router;
}
