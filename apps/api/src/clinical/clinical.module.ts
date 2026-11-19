import { Module } from "@nestjs/common";
import { RecordShareModule } from "../marketplace/record-share.module";
import { MessagingModule } from "../messaging/messaging.module";
import { ClinicalController } from "./clinical.controller";
import { ClinicalService } from "./clinical.service";
import { ClinicalSafetyService } from "./clinical-safety.service";
import { ClinicalOrdersService } from "./clinical-orders.service";
import { SpecialtyPacksService } from "./specialty-packs.service";
import { RxSafetyCheckService } from "./rx-safety-check.service";
import { DrugCatalogService } from "./drug-catalog.service";
import { DrugDatasetImportService } from "./drug-dataset-import.service";

@Module({
  imports: [MessagingModule, RecordShareModule],
  controllers: [ClinicalController],
  providers: [
    ClinicalService,
    ClinicalSafetyService,
    ClinicalOrdersService,
    SpecialtyPacksService,
    RxSafetyCheckService,
    DrugCatalogService,
    DrugDatasetImportService,
  ],
  exports: [
    ClinicalSafetyService,
    RxSafetyCheckService,
    DrugCatalogService,
    DrugDatasetImportService,
    ClinicalOrdersService,
    SpecialtyPacksService,
  ],
})
export class ClinicalModule {}
