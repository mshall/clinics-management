import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { createPrismaAdapter } from "./create-prisma-client";

/** Connects on first query so the HTTP server can boot before Postgres is ready (e.g. Docker still starting). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: createPrismaAdapter(),
      log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
