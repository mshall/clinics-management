import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { VisitCollectionDto } from "../../common/dto/visit-collection.dto";
import type { VisitCollectionInput } from "../../common/visit-collection";

export class CollectVisitBalanceDto {
  @ApiProperty({ type: VisitCollectionDto })
  @ValidateNested()
  @Type(() => VisitCollectionDto)
  visitCollection!: VisitCollectionDto;

  toVisitCollectionInput(): VisitCollectionInput {
    return {
      mode: this.visitCollection.mode,
      transferChannel: this.visitCollection.transferChannel,
      transferReference: this.visitCollection.transferReference,
    };
  }
}