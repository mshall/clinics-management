import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";
import { CreatePatientDto } from "./create-patient.dto";

export class UpdatePatientDto extends PartialType(CreatePatientDto) {
  @ApiPropertyOptional({
    description: "Mark a provisional booking chart as a finished patient profile after required demographics are saved",
  })
  @IsOptional()
  @IsBoolean()
  completeProfile?: boolean;
}
