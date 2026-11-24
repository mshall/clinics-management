import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { PayInvoiceMethod } from "./kiorly-payment.service";

/** Body of `cardSession` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class KiorlyBillingPaymentsCardSessionBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  returnUrl!: string;
}

/** Body of `pay` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class KiorlyBillingPaymentsPayBodyDto {
  @ApiProperty({ enum: ["card", "saved_card", "paymob", "fawry", "instapay", "bank"] })
  @IsIn(["card", "saved_card", "paymob", "fawry", "instapay", "bank"])
  method!: PayInvoiceMethod;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  proofUploadKey?: string;
}
