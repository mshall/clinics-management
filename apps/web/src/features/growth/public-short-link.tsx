import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiUrl } from "@/lib/api-url";
import "./growth-i18n";

/**
 * `/q/<code>`: the short link printed in QR codes. Asks the API where the code points (never a URL from the address bar) and moves the visitor there.
 * The API only answers with a page on a configured host, so there is no open redirect; an unknown code shows a plain not-found message.
 */
export function PublicShortLinkPage() {
  const { code } = useParams();
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetch(apiUrl(`/api/v1/public/links/q/${encodeURIComponent(code ?? "")}`), { headers: { Accept: "application/json" } })
      .then(async (r) => {
        if (!r.ok) throw new Error("not found");
        const body = (await r.json()) as { target?: string };
        if (!body.target) throw new Error("no target");
        const u = new URL(body.target, window.location.origin);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad target");
        if (alive) window.location.replace(u.origin === window.location.origin ? `${u.pathname}${u.search}` : u.toString());
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [code]);
  return failed ? (
    <div className="mx-auto max-w-lg p-8 text-center" data-testid="short-link-not-found" role="alert">
      <p className="text-lg font-medium">{t("bookingPage.notFound", "This booking page does not exist.")}</p>
    </div>
  ) : (
    <p role="status" className="p-8 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
  );
}
