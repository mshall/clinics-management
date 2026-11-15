import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VisitCollectionMode, MoneyTransferChannel } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

export class VisitCollectionDto {
  @ApiProperty({ enum: VisitCollectionMode })
  @IsEnum(VisitCollectionMode)
  mode!: VisitCollectionMode;

  @ApiPropertyOptional({ enum: MoneyTransferChannel, description: "Required when mode is MONEY_TRANSFER" })
  @ValidateIf((o: VisitCollectionDto) => o.mode === VisitCollectionMode.MONEY_TRANSFER)
  @IsEnum(MoneyTransferChannel)
  transferChannel?: MoneyTransferChannel;

  @ApiPropertyOptional({ description: "Bank transfer transaction id (InstaPay / Fawry)" })
  @ValidateIf((o: VisitCollectionDto) => o.mode === VisitCollectionMode.MONEY_TRANSFER)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  transferReference?: string;
}