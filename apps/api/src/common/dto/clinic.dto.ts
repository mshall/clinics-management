import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ClinicDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  parentClinicId!: string | null;

  @ApiProperty()
  nameEn!: string;

  @ApiProperty()
  nameAr!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  country!: string;

  @ApiProperty({ enum: ["parent", "branch", "standalone"] })
  kind!: "parent" | "branch" | "standalone";

  @ApiPropertyOptional({ nullable: true, description: "Parent clinic display name when loaded with list" })
  parentNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ description: "Default currency for fees at this clinic" })
  defaultCurrency!: string;

  @ApiProperty({ enum: ["ACTIVE", "INACTIVE"] })
  recordStatus!: "ACTIVE" | "INACTIVE";

  @ApiPropertyOptional({ nullable: true, type: String })
  disabledAt!: string | null;

  @ApiProperty({ description: "When the clinic record was created (ISO timestamp)" })
  createdAt!: string;
}
