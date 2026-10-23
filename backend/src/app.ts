import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import loanRoutes from "./routes/loan.routes";
import summaryRoutes from "./routes/summary.routes";
import { AppError } from "./utils/errors";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "miniledger-api", timestamp: new Date().toISOString() }));
app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/summary", summaryRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found.", code: "NOT_FOUND" }));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
  console.error("Unhandled request error:", err);
  return res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
});
