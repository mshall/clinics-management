import { Module } from "@nestjs/common";
import { ClinicalController } from "./clinical.controller";
import { ClinicalService } from "./clinical.service";
import { ClinicalSafetyService } from "./clinical-safety.service";
import { RxSafetyCheckService } from "./rx-safety-check.service";
import { DrugCatalogService } from "./drug-catalog.service";
import { DrugDatasetImportService } from "./drug-dataset-import.service";

@Module({
  controllers: [ClinicalController],
  providers: [ClinicalService, ClinicalSafetyService, RxSafetyCheckService, DrugCatalogService, DrugDatasetImportService],
  exports: [ClinicalSafetyService, RxSafetyCheckService, DrugCatalogService, DrugDatasetImportService],
})
export class ClinicalModule {}
