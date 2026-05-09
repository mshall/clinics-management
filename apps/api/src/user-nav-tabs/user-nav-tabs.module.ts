import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UserNavTabsController } from "./user-nav-tabs.controller";
import { UserNavTabsService } from "./user-nav-tabs.service";

@Module({
  imports: [PrismaModule],
  controllers: [UserNavTabsController],
  providers: [UserNavTabsService],
  exports: [UserNavTabsService],
})
export class UserNavTabsModule {}
