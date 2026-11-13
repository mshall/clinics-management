import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/http";

type Photo = {
  id: string;
  kind: string;
  pairGroupId?: string | null;
  caption?: string | null;
  takenAt?: string | null;
};

export function PatientClinicalPhotoGallery({ patientId }: { patientId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["patient", patientId, "clinical-photos"],
    queryFn: () => apiGet<Photo[]>(`/api/v1/patients/${patientId}/clinical-photos`),
  });

  const pairs = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const p of q.data ?? []) {
      const key = p.pairGroupId ?? p.id;
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [q.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("patients.photoGallery", "Clinical photo gallery")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {q.isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : pairs.length === 0 ? (
          <p className="text-muted-foreground">{t("patients.noClinicalPhotos", "Upload before/after pairs from encounters or clinical tools.")}</p>
        ) : (
          pairs.map(([key, photos]) => (
            <div key={key} className="rounded-md border border-border p-2">
              <p className="mb-2 text-xs text-muted-foreground">{t("patients.pairGroup", "Comparison set")}</p>
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="rounded border bg-muted/40 px-2 py-1 text-xs">
                    <strong>{p.kind}</strong>
                    {p.caption ? ` — ${p.caption}` : null}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
