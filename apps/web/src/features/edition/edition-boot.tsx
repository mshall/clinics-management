import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import i18n from "i18next";
import { apiGet } from "@/lib/http";
import { applyEdition, resolveEdition, type Edition, type NurseTenantKind } from "@/lib/edition";
import { useAuthStore } from "@/stores/auth-store";

type PublicEdition = { edition: Edition };
type OrgContext = { edition: Edition; kind: NurseTenantKind | null };

/**
 * KNED02 — applies the edition (Nurse Rose accent, "Kiorly Nurse" name, nurse terminology) to the whole app.
 * Signed out: by Host (nurse.kiorly.com). Signed in: by the organization's own edition from `/nurse/context`.
 * Mounted once, renders nothing.
 */
export function EditionBoot() {
  const token = useAuthStore((s) => s.accessToken);
  const host = typeof window === "undefined" ? "" : window.location.host;
  const org = useQuery({ queryKey: ["nurse", "context"], queryFn: () => apiGet<OrgContext>("/api/v1/nurse/context"), enabled: Boolean(token), staleTime: 5 * 60_000, retry: false });
  const pub = useQuery({ queryKey: ["nurse", "public-edition"], queryFn: () => apiGet<PublicEdition>("/api/v1/public/nurse/edition"), enabled: !token, staleTime: 5 * 60_000, retry: false });

  const edition = resolveEdition({ orgEdition: org.data?.edition ?? null, host: token ? null : host });
  const kind = org.data?.kind ?? null;
  const serverEdition = token ? org.data?.edition : pub.data?.edition;

  useEffect(() => {
    applyEdition(serverEdition ?? edition, kind, i18n);
    // re-render translated strings after the bundle changed
    void i18n.changeLanguage(i18n.language);
  }, [serverEdition, edition, kind]);
  return null;
}
