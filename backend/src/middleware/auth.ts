import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/errors";

export interface AuthRequest extends Request {
  userId?: string;
  userPhone?: string;
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(new AppError(401, "Authentication required.", "UNAUTHORIZED"));
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (!payload.sub || typeof payload.sub !== "string") {
      return next(new AppError(401, "Invalid access token.", "INVALID_TOKEN"));
    }
    req.userId = payload.sub;
    req.userPhone = typeof payload.phone === "string" ? payload.phone : undefined;
    next();
  } catch {
    next(new AppError(401, "Invalid or expired access token.", "INVALID_TOKEN"));
  }
}
