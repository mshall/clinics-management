import { ArrowLeft, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SETUP_RETURN_KEY } from "./onboarding-checklist";
import { SetupCheck } from "./setup-check";
import {
  markJustDone,
  markSkippedForNow,
  parseSetupSearch,
  setSetupSession,
  useOnboardingAutoRefresh,
  useOnboardingQuery,
  useSetupSession,
} from "./setup-session";
import "./setup.css";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Focus the control the step is about (data-setup-target="<key>"), else the first usable field in the page. Retries while the page loads. */
function useFocusTarget(stepKey: string | null, path: string) {
  useEffect(() => {
    if (!stepKey) return;
    let tries = 0;
    let marked: HTMLElement | null = null;
    const timer = window.setInterval(() => {
      tries += 1;
      const specific = document.querySelector<HTMLElement>(`[data-setup-target="${stepKey}"]`);
      // only an OPEN, visible dialog (a booking wizard or drawer the step opened) owns focus
      const dialog = Array.from(document.querySelectorAll<HTMLElement>("[role=dialog]")).find((d) => d.getAttribute("data-state") !== "closed" && d.getClientRects().length > 0 && d.getAttribute("aria-modal") !== "false") ?? null;
      const generic = !specific && !dialog ? document.querySelector<HTMLElement>("main input:not([type=hidden]):not([disabled]), main textarea:not([disabled]), main select:not([disabled])") : null;
      const el = specific ?? generic;
      if (el && el.offsetParent !== null) {
        window.clearInterval(timer);
        el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
        el.focus({ preventScroll: true });
        el.setAttribute("data-setup-highlight", "true");
        marked = el;
        window.setTimeout(() => marked?.removeAttribute("data-setup-highlight"), 4500);
      } else if (dialog || tries > 40) {
        window.clearInterval(timer);
      }
    }, 150);
    return () => {
      window.clearInterval(timer);
      marked?.removeAttribute("data-setup-highlight");
    };
  }, [stepKey, path]);
}

/** Sticky "Step 2 of 7: ..." bar shown on the page a quick-setup step opened. Detects completion, animates, and returns to the checklist. */
export function SetupContextBar() {
  const { t, i18n } = useTranslation();
  const loc = useLocation();
  const nav = useNavigate();
  const session = useSetupSession();
  useOnboardingAutoRefresh(true);

  // enter / leave a session from the URL
  useEffect(() => {
    const p = parseSetupSearch(loc.search);
    if (p) {
      let returnTo = "/";
      try { returnTo = sessionStorage.getItem(SETUP_RETURN_KEY) || "/"; } catch { /* ignore */ }
      if (!session || session.key !== p.key || session.entity !== p.entity || session.path !== loc.pathname) {
        setSetupSession({ key: p.key, entity: p.entity, path: loc.pathname, returnTo, startedPending: null });
      }
    } else if (session && session.path !== loc.pathname) {
      setSetupSession(null);
    }
  }, [loc.search, loc.pathname, session]);

  const q = useOnboardingQuery(Boolean(session), true);
  const step = useMemo(() => q.data?.steps.find((s) => s.key === session?.key), [q.data, session?.key]);
  const unit = session?.entity ? step?.entities?.find((e) => e.id === session.entity) : step;
  const status = unit?.status;
  const [success, setSuccess] = useState(false);
  const leaving = useRef(false);

  // remember whether the step was pending when the user arrived
  useEffect(() => {
    if (session && session.startedPending === null && status) setSetupSession({ ...session, startedPending: status === "pending" });
  }, [session, status]);

  // finished: animate, remember for the checklist, go back
  useEffect(() => {
    if (!session || !step || !session.startedPending || status !== "done" || leaving.current) return;
    leaving.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSuccess(true);
    markJustDone({ key: session.key, entity: session.entity });
    const timer = window.setTimeout(() => {
      leaving.current = false;
      setSuccess(false);
      setSetupSession(null);
      nav(session.returnTo || "/");
    }, reduced() ? 400 : 1500);
    return () => window.clearTimeout(timer);
  }, [session, step, status, nav]);

  useFocusTarget(session?.key ?? null, `${loc.pathname}${session?.entity ?? ""}`);

  if (!session || !q.data || !step) return null;
  const live = q.data.steps.filter((s) => s.available);
  const n = Math.max(1, live.findIndex((s) => s.key === step.key) + 1);
  const lang = i18n.language.startsWith("ar") ? "ar" : "en";
  const entityName = session.entity ? step.entities?.find((e) => e.id === session.entity) : null;
  const where = entityName ? (lang === "ar" ? entityName.nameAr || entityName.nameEn : entityName.nameEn) : null;
  const back = () => {
    setSetupSession(null);
    nav(session.returnTo || "/");
  };
  const skipForNow = () => {
    markSkippedForNow(session.key);
    back();
  };

  return (
    <section
      aria-label={t("onboarding.bar.region")}
      className="kx-setup-bar sticky top-14 z-[9] -mx-3 -mt-3 mb-3 border-b border-primary/25 bg-primary/5 px-3 py-2.5 backdrop-blur-sm sm:-mx-4 sm:-mt-4 sm:px-4 md:-mx-6 md:-mt-6 md:px-6"
      data-testid="setup-bar"
      data-step={session.key}
      data-success={String(success)}
      data-status={status ?? "pending"}
    >
      <div className="mx-auto flex max-w-[min(96rem,calc(100vw-1rem))] flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="text-xs font-medium uppercase tracking-wide text-primary" data-testid="setup-bar-count">
            {t("onboarding.bar.stepOf", { n, total: live.length })}
          </p>
          <p className="flex items-center gap-2 text-sm font-semibold" data-testid="setup-bar-title">
            {success || status === "done" ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-[hsl(var(--success))] text-white"><SetupCheck className="size-3.5" /></span>
            ) : null}
            <span className="truncate">{t(`onboarding.checklist.${step.key}`)}{where ? ` - ${where}` : ""}</span>
          </p>
          <p className="text-xs text-muted-foreground" data-testid="setup-bar-hint">
            {success ? t("onboarding.bar.doneReturning") : status === "done" ? t("onboarding.bar.alreadyDone") : t(`onboarding.why.${step.key}`)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={back} data-testid="setup-bar-back"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("onboarding.bar.back")}</Button>
          {status !== "done" ? (
            <Button type="button" variant="ghost" size="sm" onClick={skipForNow} data-testid="setup-bar-skip"><SkipForward className="size-4 rtl:rotate-180" aria-hidden />{t("onboarding.bar.skipForNow")}</Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
