import { Module } from "@nestjs/common";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SupportAccessSessionService } from "./support-access-session.service";

@Module({
  imports: [UserNavTabsModule],
  controllers: [SupportController],
  providers: [SupportService, SupportAccessSessionService],
  exports: [SupportService, SupportAccessSessionService],
})
export class SupportModule {}
