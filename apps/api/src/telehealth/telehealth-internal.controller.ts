import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiExcludeController, ApiTags } from "@nestjs/swagger";
import { InternalJobKeyGuard } from "../home-visits/internal-job-key.guard";
import { TelehealthNotifier } from "./telehealth-notifier.service";
import { TelehealthService } from "./telehealth.service";

/** EventBridge-driven alternative to the in-process scheduler (needed once App Runner runs more than one instance; every step is a guarded, idempotent update). */
@ApiTags("internal")
@ApiExcludeController()
@Controller("internal/jobs")
@UseGuards(InternalJobKeyGuard)
export class TelehealthInternalController {
  constructor(private readonly svc: TelehealthService, private readonly notifier: TelehealthNotifier) {}

  @Post("telehealth-tick")
  @HttpCode(200)
  async tick() {
    const sweep = await this.svc.tick();
    const reminders = await this.notifier.sendDueReminders();
    return { ...sweep, reminders };
  }
}
