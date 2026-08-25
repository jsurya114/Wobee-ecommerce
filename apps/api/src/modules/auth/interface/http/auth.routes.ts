import { loginSchema, registerSchema } from "@woobe/validation";
import { Router } from "express";
import { validate } from "../../../../middleware/validate";
import { AuthController } from "./auth.controller";

const router = Router();
const controller = new AuthController();

router.post("/register", validate(registerSchema), (req, res) => controller.register(req, res));
router.post("/login", validate(loginSchema), (req, res) => controller.login(req, res));
router.post("/refresh", (req, res) => controller.refresh(req, res));
router.post("/logout", (req, res) => controller.logout(req, res));

export { router };
