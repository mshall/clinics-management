import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { VisitCollectionDto } from "../../common/dto/visit-collection.dto";
import type { VisitCollectionInput } from "../../common/visit-collection";
import { CheckInConsentCaptureDto } from "./check-in-consent.dto";

export class FrontDeskCheckInDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paymentAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  roomLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ type: VisitCollectionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VisitCollectionDto)
  visitCollection?: VisitCollectionDto;

  @ApiPropertyOptional({ type: CheckInConsentCaptureDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckInConsentCaptureDto)
  consentCapture?: CheckInConsentCaptureDto;

  toVisitCollectionInput(): VisitCollectionInput | undefined {
    if (!this.visitCollection) return undefined;
    return {
      mode: this.visitCollection.mode,
      transferChannel: this.visitCollection.transferChannel,
      transferReference: this.visitCollection.transferReference,
    };
  }
}