import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class ClinicPhysicianDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional()
  email!: string | null;

  @ApiProperty()
  employeeId!: string;

  @ApiPropertyOptional()
  jobTitle!: string | null;
}

export class AssignClinicPhysicianDto {
  @ApiProperty({ description: "Physician user id to assign to this clinic" })
  @IsString()
  userId!: string;
}
