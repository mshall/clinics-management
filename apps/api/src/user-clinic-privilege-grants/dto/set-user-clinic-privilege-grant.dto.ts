import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class SetUserClinicHrAssignmentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  userId!: string;

  @ApiProperty({ description: "Clinic where the user will act as HR (full clinic HR permissions)" })
  @IsString()
  @MaxLength(64)
  clinicId!: string;
}
