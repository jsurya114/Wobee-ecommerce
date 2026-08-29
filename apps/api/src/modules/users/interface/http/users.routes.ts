import { createAddressSchema, updateAddressSchema, updateProfileSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { validate } from "../../../../middleware/validate";
import type { UsersController } from "./users.controller";

/** Every route requires a real login — profile and addresses are always personal, no guest/admin access here. */
export function createUsersRouter(controller: UsersController): Router {
  const router = Router();
  router.use(authGuard);

  router.get("/me", asyncHandler((req, res) => controller.getProfile(req, res)));
  router.patch("/me", validate(updateProfileSchema), asyncHandler((req, res) => controller.updateProfile(req, res)));

  router.get("/me/addresses", asyncHandler((req, res) => controller.listAddresses(req, res)));
  router.post(
    "/me/addresses",
    validate(createAddressSchema),
    asyncHandler((req, res) => controller.createAddress(req, res)),
  );
  router.patch(
    "/me/addresses/:id",
    validate(updateAddressSchema),
    asyncHandler((req, res) => controller.updateAddress(req, res)),
  );
  router.delete("/me/addresses/:id", asyncHandler((req, res) => controller.deleteAddress(req, res)));
  router.post("/me/addresses/:id/default", asyncHandler((req, res) => controller.setDefaultAddress(req, res)));

  return router;
}
