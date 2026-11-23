import { useTranslation } from "react-i18next";
import { homeUrlFromEnv, switchWorkspaceHref } from "@/lib/kiorly-home";

/**
 * "Switch product" on the sign-in page: opens Kiorly Home's product picker (`<home>/signin?switch=1`). The Home URL comes from the domain config
 * (`VITE_KIORLY_HOME_URL`); when Home is not configured nothing renders, so a standalone deployment never depends on Home.
 */
export function SwitchProductLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  const href = switchWorkspaceHref(homeUrlFromEnv({ VITE_KIORLY_HOME_URL: import.meta.env.VITE_KIORLY_HOME_URL as string | undefined, DEV: import.meta.env.DEV }));
  if (!href) return null;
  return <a href={href} data-testid="switch-product" className={className ?? "text-sm font-medium text-primary underline-offset-4 hover:underline"}>{t("auth.switchProduct")}</a>;
}
