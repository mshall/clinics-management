import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtUser } from "./jwt-user";
import { resolveJwtSigningSecret } from "./jwt-secret.util";
import { PrismaService } from "../prisma/prisma.service";

interface JwtPayload {
  sub: string;
  tenantId: string | null;
  email: string;
  role: JwtUser["role"];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSigningSecret(config),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtUser> {
    const user = await this.prisma.user.findFirst({
      where:
        payload.tenantId != null
          ? { id: payload.sub, tenantId: payload.tenantId }
          : { id: payload.sub, tenantId: null },
    });
    if (!user) throw new UnauthorizedException();
    if (user.deletedAt || user.deactivatedAt) throw new UnauthorizedException();
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
  }
}
