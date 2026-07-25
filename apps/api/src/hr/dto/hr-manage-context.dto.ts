import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

export class HrManageContextDto {
  @ApiPropertyOptional({ nullable: true, description: "Primary clinic for clinic-scoped HR officers" })
  clinicId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicNameEn!: string | null;

  @ApiProperty({ type: [String], description: "Clinic group network ids (HQ + branches) for group physician assignment" })
  groupClinicIds!: string[];

  @ApiProperty({ description: "When true, new employees are created with a fresh login (email + password)" })
  provisionLogin!: boolean;

  @ApiPropertyOptional({ enum: UserRole, isArray: true, nullable: true })
  assignableRoles!: UserRole[] | null;
}
