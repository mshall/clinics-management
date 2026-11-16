import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetchBlob, apiGet } from "@/lib/http";
import { localeForLanguage } from "@/lib/locale-display";

type Photo = {
  id: string;
  kind: string;
  pairGroupId?: string | null;
  caption?: string | null;
  takenAt?: string | null;
  createdAt?: string;
};

type PhotoPair = {
  key: string;
  photos: Photo[];
  before?: Photo;
  after?: Photo;
  displayDate: string | null;
};

export function PatientClinicalPhotoGallery({ patientId, embedded }: { patientId: string; embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.language);
  const q = useQuery({
    queryKey: ["patient", patientId, "clinical-photos"],
    queryFn: () => apiGet<Photo[]>(`/api/v1/patients/${patientId}/clinical-photos`),
  });

  const pairs = useMemo((): PhotoPair[] => {
    const map = new Map<string, Photo[]>();
    for (const p of q.data ?? []) {
      const key = p.pairGroupId ?? p.id;
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()].map(([key, photos]) => {
      const before = photos.find((p) => p.kind === "BEFORE");
      const after = photos.find((p) => p.kind === "AFTER");
      const dateSrc = before?.takenAt ?? after?.takenAt ?? photos[0]?.takenAt ?? photos[0]?.createdAt ?? null;
      return { key, photos, before, after, displayDate: dateSrc };
    });
  }, [q.data]);

  const [activeIndex, setActiveIndex] = useState(0);
  const activePair = pairs[activeIndex];

  useEffect(() => {
    if (activeIndex >= pairs.length) setActiveIndex(0);
  }, [activeIndex, pairs.length]);

  const richGallery = (
    <div className="space-y-4 text-sm">
      {q.isPending ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : pairs.length === 0 ? (
        <p className="text-muted-foreground">
          {t("patients.noClinicalPhotos", "Upload before/after pairs from encounters or clinical tools.")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("patients.comparisonSet", "Comparison set")} {activeIndex + 1} / {pairs.length}
              </p>
              {activePair?.displayDate ? (
                <p className="ltr-nums text-sm font-medium">
                  {new Date(activePair.displayDate).toLocaleString(locale)}
                </p>
              ) : (
                <p className="text-muted-foreground">{t("patients.dateUnknown", "Date not recorded")}</p>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={activeIndex <= 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                aria-label={t("common.previous", "Previous")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={activeIndex >= pairs.length - 1}
                onClick={() => setActiveIndex((i) => Math.min(pairs.length - 1, i + 1))}
                aria-label={t("common.next", "Next")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {activePair ? (
            <ClinicalPairViewer patientId={patientId} pair={activePair} locale={locale} />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {pairs.map((pair, idx) => (
              <button
                key={pair.key}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  idx === activeIndex ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/60"
                }`}
              >
                {t("patients.pairShort", "Set")} {idx + 1}
                {pair.displayDate
                  ? ` · ${new Date(pair.displayDate).toLocaleDateString(locale)}`
                  : ""}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  if (embedded) return richGallery;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("patients.photoGallery", "Clinical photo gallery")}</CardTitle>
      </CardHeader>
      <CardContent>{richGallery}</CardContent>
    </Card>
  );
}

function ClinicalPairViewer({ patientId, pair, locale }: { patientId: string; pair: PhotoPair; locale: string }) {
  const { t } = useTranslation();

  if (pair.before && pair.after) {
    return (
      <BeforeAfterSlider
        patientId={patientId}
        beforeId={pair.before.id}
        afterId={pair.after.id}
        caption={pair.before.caption ?? pair.after.caption}
      />
    );
  }

  const single = pair.before ?? pair.after ?? pair.photos[0];
  if (!single) return null;

  return (
    <div className="space-y-2">
      <ClinicalPhotoImage patientId={patientId} photoId={single.id} alt={single.kind} className="max-h-[420px] w-full rounded-lg border object-contain" />
      <p className="text-xs text-muted-foreground">
        {single.kind}
        {single.caption ? ` — ${single.caption}` : ""}
        {single.takenAt ? ` · ${new Date(single.takenAt).toLocaleString(locale)}` : ""}
      </p>
      {!pair.before || !pair.after ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("patients.partialPhotoPair", "Add both BEFORE and AFTER photos to enable the comparison slider.")}
        </p>
      ) : null}
    </div>
  );
}

function BeforeAfterSlider({
  patientId,
  beforeId,
  afterId,
  caption,
}: {
  patientId: string;
  beforeId: string;
  afterId: string;
  caption?: string | null;
}) {
  const { t } = useTranslation();
  const [position, setPosition] = useState(50);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-muted shadow-inner">
        <ClinicalPhotoImage
          patientId={patientId}
          photoId={afterId}
          alt={t("patients.afterPhoto", "After")}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${position}%` }}>
          <ClinicalPhotoImage
            patientId={patientId}
            photoId={beforeId}
            alt={t("patients.beforePhoto", "Before")}
            className="h-full w-full object-cover"
            style={{ width: position > 0 ? `${(100 / position) * 100}%` : "100%", maxWidth: "none" }}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.45)]"
          style={{ left: `${position}%` }}
        />
        <span className="pointer-events-none absolute start-3 top-3 rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
          {t("patients.beforePhoto", "Before")}
        </span>
        <span className="pointer-events-none absolute end-3 top-3 rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
          {t("patients.afterPhoto", "After")}
        </span>
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{t("patients.dragCompare", "Drag to compare before and after")}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </label>
      {caption?.trim() ? <p className="text-sm text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

function ClinicalPhotoImage({
  patientId,
  photoId,
  alt,
  className,
  style,
}: {
  patientId: string;
  photoId: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setFailed(false);
    setSrc(null);
    void apiFetchBlob(`/api/v1/patients/${patientId}/clinical-photos/${photoId}/file`)
      .then(({ blob }) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [patientId, photoId]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-muted text-xs text-muted-foreground ${className ?? ""}`}>
        {t("patients.photoUnavailable", "Image unavailable")}
      </div>
    );
  }

  if (!src) {
    return <div className={`animate-pulse bg-muted ${className ?? ""}`} aria-hidden />;
  }

  return <img src={src} alt={alt} className={className} style={style} draggable={false} />;
}