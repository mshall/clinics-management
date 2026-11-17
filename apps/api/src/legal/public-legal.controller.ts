import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { LegalService } from "./legal.service";

@ApiTags("public")
@Controller("public/legal")
export class PublicLegalController {
  constructor(private readonly legal: LegalService) {}

  @Get()
  @ApiOperation({ summary: "GT-02 — list legal document ids and versions" })
  catalog() {
    return { items: this.legal.listPublicCatalog() };
  }

  @Get(":doc")
  @ApiOperation({ summary: "GT-02 — legal document text (EN/AR)" })
  document(@Param("doc") doc: string) {
    return this.legal.getPublicDocument(doc);
  }
}