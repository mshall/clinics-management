import { ApiProperty } from "@nestjs/swagger";

export class UserClinicHrAssignmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiProperty()
  clinicNameEn!: string;
}
