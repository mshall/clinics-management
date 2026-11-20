import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

/** `X-Internal-Job-Key` must equal INTERNAL_JOB_KEY (constant-time). Unset key => the endpoints are closed (503), never open. */
@Injectable()
export class InternalJobKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_JOB_KEY?.trim();
    if (!expected) throw new ServiceUnavailableException("Internal jobs are not configured");
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const raw = req.headers["x-internal-job-key"];
    const got = Buffer.from(String(Array.isArray(raw) ? raw[0] : raw ?? ""));
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw new UnauthorizedException("Invalid job key");
    return true;
  }
}
