import { Global, Module } from "@nestjs/common";
import { FIELD_VISIT_PORT } from "./field-visit.port";
import { FieldVisitService } from "./field-visit.service";

@Global()
@Module({
  providers: [FieldVisitService, { provide: FIELD_VISIT_PORT, useExisting: FieldVisitService }],
  exports: [FIELD_VISIT_PORT, FieldVisitService],
})
export class FieldVisitModule {}
