import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

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

  @ApiPropertyOptional({ nullable: true })
  firstNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  firstNameAr!: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastNameAr!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Default exam room for auto-assignment when this physician's encounter starts",
  })
  defaultExamRoomLabel!: string | null;
}

export class AssignClinicPhysicianDto {
  @ApiProperty({ description: "Physician user id to assign to this clinic" })
  @IsString()
  userId!: string;
}

export class PatchClinicPhysicianExamRoomDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  defaultExamRoomLabel?: string | null;
}
