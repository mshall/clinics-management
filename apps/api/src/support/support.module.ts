import { Module } from "@nestjs/common";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";

@Module({
  imports: [UserNavTabsModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
