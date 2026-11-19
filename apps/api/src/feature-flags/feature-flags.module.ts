import { Global, Module } from "@nestjs/common";
import { FeatureFlagsController } from "./feature-flags.controller";
import { FeatureFlagsService } from "./feature-flags.service";
import { FeatureGuard } from "./feature.guard";
import { KiorexFlagSnapshotService } from "./kiorex-flag-snapshot.service";
import { KiorexFlagWebhookController } from "./kiorex-flag-webhook.controller";

@Global()
@Module({
  controllers: [FeatureFlagsController, KiorexFlagWebhookController],
  providers: [FeatureFlagsService, KiorexFlagSnapshotService, FeatureGuard],
  exports: [FeatureFlagsService, KiorexFlagSnapshotService, FeatureGuard],
})
export class FeatureFlagsModule {}
