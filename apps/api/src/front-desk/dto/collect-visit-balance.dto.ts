import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDefined, ValidateNested } from "class-validator";
import { VisitCollectionDto } from "../../common/dto/visit-collection.dto";
import type { VisitCollectionInput } from "../../common/visit-collection";

export class CollectVisitBalanceDto {
  @ApiProperty({ type: VisitCollectionDto })
  @IsDefined() // ValidateNested alone accepts an absent object, and toVisitCollectionInput() then dereferences undefined (a 500 once the TypeError-to-400 net was removed)
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