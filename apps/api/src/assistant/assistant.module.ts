import { Module } from "@nestjs/common";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [UserNavTabsModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
