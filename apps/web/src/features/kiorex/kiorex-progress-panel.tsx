import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Clock, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./kiorex-connect-i18n";
import "./kiorex-door-i18n";
import type { ConnectDto, ConnectStepDto } from "./kiorex-connect-types";
import type { FrontDoorState } from "./kiorex-door-types";

const ICON = { done: CheckCircle2, action_needed: AlertCircle, waiting_kiorex: Clock, blocked: Lock } as const;
const TONE = { done: "text-emerald-700 dark:text-emerald-400", action_needed: "text-amber-800 dark:text-amber-300", waiting_kiorex: "text-sky-700 dark:text-sky-400", blocked: "text-muted-foreground" } as const;

/** The step to do next: the first required step that is not done (request/live come last). */
export function nextStep(steps: ConnectStepDto[]): ConnectStepDto | undefined { return steps.find((s) => !s.optional && s.status !== "done" && s.status !== "waiting_kiorex" && s.key !== "live") ?? steps.find((s) => !s.optional && s.status === "waiting_kiorex"); }

/** States 2, 3 and 5: checklist with progress, the next step highlighted, and what happens next / what is missing. */
export function KiorexProgressPanel({ state, connect, clinicId }: { state: Exclude<FrontDoorState, "NOT_CONNECTED" | "LIVE">; connect: ConnectDto; clinicId: string }) {
  const { t } = useTranslation();
  const next = state === "IN_PROGRESS" || state === "ATTENTION" ? nextStep(connect.steps) : undefined;
  const required = connect.steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.status === "done").length;
  const decision = ["CHANGES_REQUESTED", "REJECTED", "PAUSED"].includes(connect.status) ? connect.status : null;
  const missing = state === "ATTENTION" ? connect.steps.filter((s) => !s.optional && s.status !== "done" && s.key !== "live" && s.key !== "request") : [];
  return (
    <div className="space-y-5" data-testid={`kiorex-panel-${state}`}>
      {decision ? (
        <div role="status" className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4" data-testid="connect-decision">
          <h2 className="font-semibold">{t(`kiorexDoor.attention.${decision}`)}</h2>
          <p className="text-sm">{t(`kiorexConnect.decision.${decision}`)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{decision === "PAUSED" ? t("kiorexDoor.attention.howToPaused") : t("kiorexDoor.attention.howTo")}</p>
          {missing.length ? <div className="mt-2 text-sm" data-testid="attention-missing"><b>{t("kiorexDoor.attention.fix")}:</b> {missing.map((m) => t(`kiorexConnect.step.${m.key}.title`)).join(" · ")}</div> : null}
        </div>
      ) : null}
      {state === "WAITING" ? (
        <div className="rounded-2xl border bg-card p-5" data-testid="waiting-card">
          <div className="flex items-center gap-2"><Clock className="size-5 text-sky-700 dark:text-sky-400" aria-hidden="true" /><h2 className="text-lg font-semibold">{t("kiorexDoor.waiting.title")}</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">{t("kiorexDoor.waiting.body")}</p>
          <h3 className="mt-4 text-sm font-semibold">{t("kiorexDoor.waiting.next")}</h3>
          <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm"><li>{t("kiorexDoor.waiting.n1")}</li><li>{t("kiorexDoor.waiting.n2")}</li><li>{t("kiorexDoor.waiting.n3")}</li></ol>
        </div>
      ) : null}
      <div className="rounded-2xl border bg-card p-5">
        <div role="progressbar" aria-valuenow={connect.progress} aria-valuemin={0} aria-valuemax={100} aria-label={t("kiorexDoor.progress.title")} data-testid="kiorex-progress">
          <div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium">{t("kiorexDoor.progress.title")} · {t("kiorexDoor.progress.of", { done, total: required.length })}</span><b>{connect.progress}%</b></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${connect.progress}%` }} /></div>
        </div>
        {next ? (
          <div className="mt-4 rounded-xl border-2 border-primary/60 bg-primary/5 p-4" data-testid="next-step" data-step={next.key}>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("kiorexDoor.progress.next")}</p>
            <p className="font-medium">{t(`kiorexConnect.step.${next.key}.title`)}</p>
            <p className="text-sm text-muted-foreground">{t(`kiorexConnect.step.${next.key}.hint`)}</p>
            <Button asChild size="sm" className="mt-2"><Link to="/kiorex/connect" data-testid="next-step-go">{t("kiorexConnect.fix")}</Link></Button>
          </div>
        ) : state === "IN_PROGRESS" ? <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{t("kiorexDoor.progress.allDone")}</p> : null}
        <ol className="mt-4 space-y-1.5" data-testid="kiorex-steps">
          {connect.steps.map((s, i) => { const Icon = ICON[s.status]; return (
            <li key={s.key} data-status={s.status} data-testid={`panel-step-${s.key}`} className={`flex items-center gap-2 text-sm ${next?.key === s.key ? "font-semibold" : ""}`}>
              <Icon className={`size-4 shrink-0 ${TONE[s.status]}`} aria-hidden="true" /><span>{i + 1}. {t(`kiorexConnect.step.${s.key}.title`)}</span>{s.optional ? <span className="rounded-full border px-2 text-xs text-muted-foreground">{t("kiorexConnect.optional")}</span> : null}
              <span className={`ms-auto text-xs ${TONE[s.status]}`}>{t(`kiorexConnect.state.${s.status}`)}</span>
            </li>); })}
        </ol>
        <Button asChild variant="outline" className="mt-4"><Link to="/kiorex/connect" data-testid="panel-open-wizard">{t("kiorexDoor.progress.open")}</Link></Button>
      </div>
      <span hidden data-clinic={clinicId} />
    </div>
  );
}
