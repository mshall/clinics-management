import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { createHash } from "node:crypto";
import { consumeRateLimit } from "../common/rate-limit";
import { TelehealthException } from "./telehealth.errors";
import { TelehealthService } from "./telehealth.service";

/** Patient-facing token endpoints (no login). Tokens are bearer secrets: never logged, responses are no-store. */
@ApiTags("telehealth-public")
@Controller("v/:token")
export class TelehealthPublicController {
  constructor(private readonly svc: TelehealthService) {}

  private guard(token: string, ip: string | undefined, kind: string, max: number): void {
    const tk = createHash("sha256").update(token).digest("hex").slice(0, 16);
    const a = consumeRateLimit(`thp:${kind}:t:${tk}`, max, 60_000);
    const b = consumeRateLimit(`thp:${kind}:i:${ip ?? "-"}`, max * 4, 60_000);
    if (!a.ok || !b.ok) throw new TelehealthException("TELEHEALTH_RATE_LIMITED", { retryAfterSec: !a.ok ? a.retryAfterSec : (b as { retryAfterSec: number }).retryAfterSec });
  }
  private noStore(res: { setHeader: (k: string, v: string) => void }): void {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
  }

  @Get("info")
  @ApiOperation({ summary: "Public link state: first name, doctor, clinic, time, or a clear state (cancelled, moved, in-person, too early, expired)" })
  async info(@Param("token") token: string, @Req() req: { ip?: string }, @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void }) {
    this.guard(token, req.ip, "info", 30);
    this.noStore(res);
    return this.svc.publicInfo(token);
  }

  @Get("calendar.ics")
  @ApiOperation({ summary: "Optional .ics for the visit (device calendar)" })
  async ics(@Param("token") token: string, @Req() req: { ip?: string }, @Res() res: { setHeader: (k: string, v: string) => void; send: (b: string) => void }) {
    this.guard(token, req.ip, "ics", 10);
    this.noStore(res);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="video-visit.ics"');
    res.send(await this.svc.calendarFor(token));
  }

  @Post("join")
  @HttpCode(200)
  async join(@Param("token") token: string, @Req() req: { ip?: string }, @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void }) {
    this.guard(token, req.ip, "join", 20);
    this.noStore(res);
    return this.svc.joinAsPatient(token);
  }

  @Post("signals")
  @HttpCode(200)
  async post(@Param("token") token: string, @Body() body: { type?: string; payload?: unknown }, @Req() req: { ip?: string }, @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void }) {
    this.guard(token, req.ip, "sigpost", 300);
    this.noStore(res);
    return this.svc.postSignal({ token }, body ?? {});
  }

  @Get("signals")
  async get(@Param("token") token: string, @Query("afterSeq") afterSeq: string | undefined, @Req() req: { ip?: string }, @Res({ passthrough: true }) res: { setHeader: (k: string, v: string) => void }) {
    this.guard(token, req.ip, "sigget", 120);
    this.noStore(res);
    return this.svc.pollSignals({ token }, Number(afterSeq) || 0);
  }

  @Post("mode")
  @HttpCode(200)
  async mode(@Param("token") token: string, @Body() body: { mode?: string }, @Req() req: { ip?: string }) {
    this.guard(token, req.ip, "mode", 30);
    return this.svc.setMode({ token }, String(body?.mode ?? ""));
  }

  @Post("end")
  @HttpCode(200)
  async end(@Param("token") token: string, @Req() req: { ip?: string }) {
    this.guard(token, req.ip, "end", 20);
    return this.svc.end({ token });
  }
}
