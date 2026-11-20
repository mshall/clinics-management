import { BookOpen, PlayCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { HELP_ARTICLES, searchHelpArticles, type HelpArticle, type HelpPlanTier } from "./help-articles";
import { HELP_VIDEOS, helpVideoUrl } from "./help-content";

const TIER_FILTERS: Array<HelpPlanTier | "ALL"> = ["ALL", "LITE", "PRO", "CLINIC", "GROUP"];

function ArticleCard({ article, ar }: { article: HelpArticle; ar: boolean }) {
  const { t } = useTranslation();
  const videoUrl = article.videoId ? helpVideoUrl(article.videoId) : null;
  return (
    <article
      id={article.id}
      data-testid={`help-article-${article.id}`}
      data-question-id={article.questionId}
      className="scroll-mt-20 space-y-2 rounded-lg border border-border/60 bg-card/40 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{ar ? article.titleAr : article.titleEn}</h2>
        {article.tiers.map((tier) => (
          <Badge key={tier} variant="secondary" className="text-[10px]">
            {tier === "ALL" ? t("help.centre.tierAll") : tier}
          </Badge>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{ar ? article.bodyAr : article.bodyEn}</p>
      {article.videoId ? (
        <p className="flex items-center gap-2 text-sm">
          <PlayCircle className="size-4 shrink-0 text-muted-foreground" />
          {videoUrl ? (
            <a href={videoUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
              {t(`help.videos.${article.videoId}`)}
            </a>
          ) : (
            <span className="text-muted-foreground">
              {t(`help.videos.${article.videoId}`)} · {t("help.videoSoon")}
            </span>
          )}
        </p>
      ) : null}
    </article>
  );
}

/** GT-03 help centre: searchable task articles + golden-flow Arabic videos. */
export function HelpCentrePage() {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith("ar");
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const tier = (params.get("tier")?.toUpperCase() as HelpPlanTier | "ALL" | null) || "ALL";

  const results = useMemo(
    () => searchHelpArticles(query, { tier: tier === "ALL" ? null : tier, locale: ar ? "ar" : "en" }),
    [query, tier, ar],
  );

  const setTier = (next: HelpPlanTier | "ALL") => {
    const p = new URLSearchParams(params);
    if (next === "ALL") p.delete("tier");
    else p.set("tier", next);
    setParams(p, { replace: true });
  };

  const onQuery = (value: string) => {
    setQuery(value);
    const p = new URLSearchParams(params);
    if (value.trim()) p.set("q", value);
    else p.delete("q");
    setParams(p, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6" data-testid="help-centre" dir={ar ? "rtl" : "ltr"}>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("help.centre.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("help.centre.subtitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t("help.centre.count", { count: HELP_ARTICLES.length })}
        </p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground inset-s-3" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("help.centre.searchPlaceholder")}
          className="ps-9"
          data-testid="help-centre-search"
          aria-label={t("help.centre.searchPlaceholder")}
        />
      </div>

      <div className="flex flex-wrap gap-2" data-testid="help-centre-tiers">
        {TIER_FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTier(key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              tier === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
            data-testid={`help-tier-${key}`}
          >
            {key === "ALL" ? t("help.centre.tierAll") : key}
          </button>
        ))}
      </div>

      <section className="space-y-2" data-testid="help-centre-videos">
        <h2 className="text-sm font-semibold">{t("help.videosTitle")}</h2>
        <ul className="space-y-1 text-sm">
          {HELP_VIDEOS.map((id) => {
            const url = helpVideoUrl(id);
            return (
              <li key={id} className="flex items-center gap-2">
                <PlayCircle className="size-4 shrink-0 text-muted-foreground" />
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    {t(`help.videos.${id}`)}
                  </a>
                ) : (
                  <span className="text-muted-foreground">
                    {t(`help.videos.${id}`)} · {t("help.videoSoon")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3" data-testid="help-centre-articles">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("help.centre.articlesTitle")}</h2>
          <span className="text-xs text-muted-foreground" data-testid="help-centre-result-count">
            {t("help.centre.results", { count: results.length })}
          </span>
        </div>
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="help-centre-empty">
            {t("help.centre.empty")}
          </p>
        ) : (
          results.map((article) => <ArticleCard key={article.id} article={article} ar={ar} />)
        )}
      </section>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <BookOpen className="size-4" />
        <Link to="/guide" className="underline-offset-2 hover:underline">
          {t("help.fullGuide")}
        </Link>
      </p>
    </div>
  );
}
