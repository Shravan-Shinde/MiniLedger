import { Router } from "express";
import { AuthRequest, requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getSummary } from "../services/loan.service";

const router = Router();
router.use(requireAuth);
router.get("/", asyncHandler(async (req: AuthRequest, res) => {
  res.json(await getSummary(req.userId!));
}));
export default router;
