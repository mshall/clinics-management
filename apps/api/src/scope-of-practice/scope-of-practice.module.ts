import { Global, Module } from "@nestjs/common";
import { ScopeGuard } from "./scope.guard";
import { ScopeOfPracticeController } from "./scope-of-practice.controller";
import { ScopeOfPracticeService } from "./scope-of-practice.service";

@Global()
@Module({
  controllers: [ScopeOfPracticeController],
  providers: [ScopeOfPracticeService, ScopeGuard],
  exports: [ScopeOfPracticeService, ScopeGuard],
})
export class ScopeOfPracticeModule {}
