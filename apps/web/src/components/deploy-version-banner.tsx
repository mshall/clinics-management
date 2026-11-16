import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  dismissPendingDeploy,
  getPendingDeployBuildId,
  subscribeDeployVersion,
  tryApplyDeployReload,
} from "@/lib/deploy-version-watch";

export function DeployVersionBanner() {
  const { t } = useTranslation();
  const [pending, setPending] = useState(getPendingDeployBuildId);

  useEffect(() => subscribeDeployVersion(setPending), []);

  if (!pending) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm"
    >
      <span>
        {t(
          "app.newVersionAvailable",
          "A new version is available. Reload to get the latest fixes (save your work first).",
        )}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            dismissPendingDeploy();
            setPending(null);
          }}
        >
          {t("common.later", "Later")}
        </Button>
        <Button type="button" size="sm" onClick={() => tryApplyDeployReload("user")}>
          {t("app.reloadNow", "Reload now")}
        </Button>
      </div>
    </div>
  );
}