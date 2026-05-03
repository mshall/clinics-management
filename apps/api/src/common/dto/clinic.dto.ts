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

  @ApiProperty({ enum: ["parent", "branch"] })
  kind!: "parent" | "branch";

  @ApiPropertyOptional({ nullable: true, description: "Parent clinic display name when loaded with list" })
  parentNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  logoUrl!: string | null;
}
