import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsObject, IsOptional, IsString } from "class-validator";

export class SetUserNavTabsDto {
  @ApiProperty({
    description: "Allowed tab keys for this user (intersected with role on save). Empty = clear override.",
    type: [String],
    example: ["dashboard", "revenue", "reports", "profile"],
  })
  @IsArray()
  @IsString({ each: true })
  tabKeys!: string[];

  @ApiPropertyOptional({
    description: "When granting the HR tab, the clinic where this user will act as HR (required if they have no clinic HR assignment yet)",
  })
  @IsOptional()
  @IsString()
  hrClinicId?: string;

  @ApiPropertyOptional({
    description: "Per-tab access: read (view only) or write (full CRUD). Omitted tabs default to write.",
    example: { operations: "read", expenses: "write" },
  })
  @IsOptional()
  @IsObject()
  tabAccessModes?: Record<string, "read" | "write">;
}
