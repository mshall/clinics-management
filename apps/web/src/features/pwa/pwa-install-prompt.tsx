import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiPost } from "@/lib/http";
import { fetchOnboardingProgress } from "@/lib/onboarding-api";
import {
  captureInstallPrompt,
  clearDeferredInstallPrompt,
  dismissInstallPrompt,
  getDeferredInstallPrompt,
  isInstallDismissed,
  isStandaloneDisplay,
  registerPushSubscription,
  wasPushPrompted,
} from "@/lib/pwa";
import { Button } from "@/components/ui/button";

/**
 * UX-01 — show install prompt after clinic activation; optionally enable push.
 */
export function PwaInstallPrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [pushHint, setPushHint] = useState(false);

  const onboardingQ = useQuery({
    queryKey: ["onboarding", "status"],
    queryFn: () => fetchOnboardingProgress(),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    const onBip = (e: Event) => {
      captureInstallPrompt(e);
      maybeShow();
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    maybeShow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingQ.data?.activatedAt]);

  function maybeShow() {
    if (isStandaloneDisplay() || isInstallDismissed()) {
      setVisible(false);
      return;
    }
    const activated = Boolean(onboardingQ.data?.activatedAt);
    if (!activated) return;
    if (getDeferredInstallPrompt() || /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      setVisible(true);
    }
  }

  async function onInstall() {
    const prompt = getDeferredInstallPrompt();
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      clearDeferredInstallPrompt();
    }
    setVisible(false);
    if (!wasPushPrompted()) setPushHint(true);
  }

  function onDismiss() {
    dismissInstallPrompt();
    setVisible(false);
  }

  async function onEnablePush() {
    await registerPushSubscription((path, body) => apiPost(path, body));
    setPushHint(false);
  }

  if (!visible && !pushHint) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-16 z-40 mx-auto max-w-lg px-3 md:bottom-4"
      role="dialog"
      aria-label={t("pwa.installTitle")}
    >
      <div className="rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur-sm">
        {visible ? (
          <>
            <p className="text-sm font-medium">{t("pwa.installTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("pwa.installBody")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void onInstall()}>
                {t("pwa.installCta")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
                {t("pwa.installDismiss")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{t("pwa.pushTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("pwa.pushBody")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void onEnablePush()}>
                {t("pwa.pushCta")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPushHint(false)}>
                {t("pwa.installDismiss")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
