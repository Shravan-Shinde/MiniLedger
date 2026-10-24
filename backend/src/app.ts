import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { Prisma } from "@prisma/client";
import { prisma } from "./config/prisma";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import loanRoutes from "./routes/loan.routes";
import summaryRoutes from "./routes/summary.routes";
import { AppError } from "./utils/errors";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((s) => s.trim()) }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      status: "ok",
      database: "connected",
      service: "miniledger-api",
      timestamp: new Date().toISOString()
    });
  } catch {
    return res.status(503).json({
      status: "degraded",
      database: "disconnected",
      service: "miniledger-api",
      error: "Database service unavailable.",
      timestamp: new Date().toISOString()
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/summary", summaryRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found.", code: "NOT_FOUND" }));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }

  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err as any)?.code === "P1001" ||
    (err as any)?.code === "P1002" ||
    (err as any)?.code === "P1017" ||
    (err as any)?.name === "PrismaClientInitializationError"
  ) {
    return res.status(503).json({
      error: "Database service unavailable. Please try again later.",
      code: "DATABASE_UNAVAILABLE"
    });
  }

  console.error("Unhandled request error:", err);
  return res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
});
