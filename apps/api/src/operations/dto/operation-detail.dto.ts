import { ApiProperty } from "@nestjs/swagger";
import { OperationDto } from "./operation.dto";
import { OperationDocumentDto, OperationMedicationDto } from "./operation-clinical.dto";

export class OperationDetailDto extends OperationDto {
  @ApiProperty()
  noMedications!: boolean;

  @ApiProperty({ type: [OperationMedicationDto] })
  medications!: OperationMedicationDto[];

  @ApiProperty({ type: [OperationDocumentDto] })
  documents!: OperationDocumentDto[];
}
