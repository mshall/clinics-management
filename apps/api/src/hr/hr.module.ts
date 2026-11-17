import { Module } from "@nestjs/common";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

@Module({
  imports: [UserNavTabsModule],
  controllers: [HrController],
  providers: [HrService],
})
export class HrModule {}
