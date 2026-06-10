import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ClinicDetailDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  parentClinicId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  parentNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  parentNameAr!: string | null;

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

  @ApiPropertyOptional({ nullable: true })
  logoUrl!: string | null;

  @ApiProperty()
  addressEn!: string;

  @ApiProperty()
  addressAr!: string;

  @ApiProperty()
  locationUrl!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  licenseNumber!: string;

  @ApiProperty()
  defaultLanguage!: string;
}
