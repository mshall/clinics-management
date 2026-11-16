import type { NextFunction, Request, Response } from "express";

/** Lets production SPAs detect a new static bundle via normal API traffic (no periodic polling). */
export function webBuildIdMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const id = process.env.WEB_BUILD_ID?.trim();
  if (id) res.setHeader("X-Kiorly-Web-Build-Id", id);
  const builtAt = process.env.WEB_BUILD_BUILT_AT?.trim();
  if (builtAt) res.setHeader("X-Kiorly-Web-Build-Built-At", builtAt);
  const minBuiltAt = process.env.WEB_MIN_BUILT_AT?.trim();
  if (minBuiltAt) res.setHeader("X-Kiorly-Web-Min-Built-At", minBuiltAt);
  next();
}