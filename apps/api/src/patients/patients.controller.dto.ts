import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `mergePatients` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PatientsMergePatientsBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  sourcePatientId!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  fieldChoices?: Record<string, "target" | "source">;
}
