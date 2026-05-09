import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";

export class SetUserNavTabsDto {
  @ApiProperty({
    description: "Allowed tab keys for this user (intersected with role on save). Empty = clear override.",
    type: [String],
    example: ["dashboard", "revenue", "reports", "profile"],
  })
  @IsArray()
  @IsString({ each: true })
  tabKeys!: string[];
}
