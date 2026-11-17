import { NotFoundException, Injectable } from "@nestjs/common";
import { isLegalDocumentId, LEGAL_DOC_IDS } from "./legal-catalog";
import { legalDocumentPayload } from "./legal-pack-content";

@Injectable()
export class LegalService {
  getPublicDocument(doc: string) {
    if (!isLegalDocumentId(doc)) throw new NotFoundException("Legal document not found");
    return legalDocumentPayload(doc);
  }

  listPublicCatalog() {
    return LEGAL_DOC_IDS.map((id) => legalDocumentPayload(id));
  }
}