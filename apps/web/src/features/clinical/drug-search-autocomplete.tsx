import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/http";

export type DrugSearchHit = {
  id: string;
  brandNameEn: string;
  brandNameAr: string | null;
  form: string;
  strength: string | null;
  pack: string | null;
  ingredients: { nameEn: string; nameAr: string | null; strength: string | null }[];
  defaultSigEn: string | null;
  defaultSigAr: string | null;
};

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  drugProductId: string | null;
  onProductSelect: (hit: DrugSearchHit | null) => void;
  onBlur?: () => void;
};

export function DrugSearchAutocomplete({
  value,
  onValueChange,
  drugProductId,
  onProductSelect,
  onBlur,
}: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const searchQuery = useQuery({
    queryKey: ["clinical", "drugs", value],
    queryFn: () => apiGet<DrugSearchHit[]>(`/api/v1/clinical/drugs/search?q=${encodeURIComponent(value)}&limit=12`),
    enabled: value.trim().length >= 2 && open,
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative space-y-1">
      <Input
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          onProductSelect(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        placeholder={t("drugs.searchPlaceholder", "Brand name (AR/EN)")}
        autoComplete="off"
      />
      {!drugProductId && value.trim().length > 1 ? (
        <p className="text-xs text-[hsl(var(--warning))] ">
          {t("clinical.safetyUnavailable", "Safety check unavailable — select a catalog drug for ingredient-level checks.")}
        </p>
      ) : null}
      {open && value.trim().length >= 2 ? (
        <ul className="absolute z-20 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-sm shadow-md">
          {searchQuery.isFetching ? (
            <li className="px-2 py-1.5 text-muted-foreground">{t("common.loading")}</li>
          ) : null}
          {(searchQuery.data ?? []).map((hit) => {
            const label = isAr ? hit.brandNameAr ?? hit.brandNameEn : hit.brandNameEn;
            const ingredients = hit.ingredients.map((i) => (isAr ? i.nameAr ?? i.nameEn : i.nameEn)).join(" + ");
            return (
              <li key={hit.id}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-start hover:bg-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const printed = [hit.brandNameEn, hit.strength, hit.form].filter(Boolean).join(" ");
                    onValueChange(printed);
                    onProductSelect(hit);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {hit.strength ? `${hit.strength} · ` : ""}
                    {hit.form}
                    {ingredients ? ` · ${ingredients}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
          {!searchQuery.isFetching && (searchQuery.data ?? []).length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">{t("drugs.noMatches", "No catalog matches")}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}