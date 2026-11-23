import { Injectable } from "@nestjs/common";

/** Filled in by the notifications commit (templates, reminders 24h/15m, moved/regenerated sends). */
@Injectable()
export class TelehealthNotifier {
  async sessionChanged(_sessionId: string): Promise<void> {
    /* notifications commit */
  }
  async sendDueReminders(_now = new Date()): Promise<number> {
    return 0;
  }
  async patientJoined(_sessionId: string): Promise<void> {
    /* notifications commit */
  }
}
