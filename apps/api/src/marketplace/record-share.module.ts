import { Module } from "@nestjs/common";
import { MessagingModule } from "../messaging/messaging.module";
import { RecordShareService } from "./record-share.service";

@Module({
  imports: [MessagingModule],
  providers: [RecordShareService],
  exports: [RecordShareService],
})
export class RecordShareModule {}
