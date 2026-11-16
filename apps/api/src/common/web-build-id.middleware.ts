import type { NextFunction, Request, Response } from "express";

/** Lets production SPAs detect a new static bundle via normal API traffic (no periodic polling). */
export function webBuildIdMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const id = process.env.WEB_BUILD_ID?.trim();
  if (id) res.setHeader("X-Kiorly-Web-Build-Id", id);
  next();
}