import { Module } from "@nestjs/common";
import { MessagingModule } from "../messaging/messaging.module";
import { ClinicalController } from "./clinical.controller";
import { ClinicalService } from "./clinical.service";
import { ClinicalSafetyService } from "./clinical-safety.service";
import { ClinicalOrdersService } from "./clinical-orders.service";
import { RxSafetyCheckService } from "./rx-safety-check.service";
import { DrugCatalogService } from "./drug-catalog.service";
import { DrugDatasetImportService } from "./drug-dataset-import.service";

@Module({
  imports: [MessagingModule],
  controllers: [ClinicalController],
  providers: [
    ClinicalService,
    ClinicalSafetyService,
    ClinicalOrdersService,
    RxSafetyCheckService,
    DrugCatalogService,
    DrugDatasetImportService,
  ],
  exports: [ClinicalSafetyService, RxSafetyCheckService, DrugCatalogService, DrugDatasetImportService, ClinicalOrdersService],
})
export class ClinicalModule {}
