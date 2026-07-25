import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class SetUserClinicPrivilegeGrantDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  userId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  clinicId!: string;

  @ApiProperty({ description: "Employee at this clinic whose login privileges are mirrored for the target user" })
  @IsString()
  @MaxLength(64)
  templateEmployeeId!: string;
}
