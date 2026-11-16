import { Module } from "@nestjs/common";
import { UserMoneyVisibilityController } from "./user-money-visibility.controller";
import { UserMoneyVisibilityService } from "./user-money-visibility.service";

@Module({
  controllers: [UserMoneyVisibilityController],
  providers: [UserMoneyVisibilityService],
  exports: [UserMoneyVisibilityService],
})
export class UserMoneyVisibilityModule {}