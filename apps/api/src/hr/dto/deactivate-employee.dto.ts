import { ApiProperty } from "@nestjs/swagger";
import { IsDateString } from "class-validator";

export class DeactivateEmployeeDto {
  @ApiProperty({ description: "Resignation date (YYYY-MM-DD)" })
  @IsDateString()
  resignationDate!: string;
}
