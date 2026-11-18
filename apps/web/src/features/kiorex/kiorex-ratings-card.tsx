import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/http";
import type { KiorexRatingsDto, KiorexReviewDto } from "./kiorex-types";

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className="size-3.5" fill={i <= Math.round(value) ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

function ReviewRow({ clinicId, review }: { clinicId: string; review: KiorexReviewDto }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(review.replyText ?? "");
  const reply = useMutation({
    mutationFn: () => apiPost(`/api/v1/kiorex/reviews/${encodeURIComponent(review.id)}/reply`, { text }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["kiorex", "ratings", clinicId] });
      toast.success(t("kiorexTab.ratings.replySent", "Reply sent to Kiorex"));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <li className="space-y-2 rounded-md border px-3 py-2 text-sm" data-testid="kiorex-review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Stars value={review.rating} />
          <span className="text-muted-foreground">{review.clinicianName}</span>
        </span>
        <span className="text-xs text-muted-foreground ltr-nums">
          {new Date(review.reviewedAt).toLocaleDateString(i18n.language)}
        </span>
      </div>
      {review.comment ? <p>{review.comment}</p> : null}
      {review.replyText && !open ? (
        <p className="border-s-2 ps-3 text-muted-foreground">
          <span className="font-medium">{t("kiorexTab.ratings.yourReply", "Your reply")}: </span>
          {review.replyText}
        </p>
      ) : null}
      {open ? (
        <div className="space-y-2">
          <Textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" type="button" disabled={reply.isPending || text.trim().length < 2} onClick={() => reply.mutate()}>
              {t("kiorexTab.ratings.send", "Send reply")}
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" type="button" variant="outline" onClick={() => setOpen(true)}>
          {review.replyText ? t("kiorexTab.ratings.editReply", "Edit reply") : t("kiorexTab.ratings.reply", "Reply")}
        </Button>
      )}
    </li>
  );
}

export function KiorexRatingsCard({ clinicId }: { clinicId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["kiorex", "ratings", clinicId],
    queryFn: () => apiGet<KiorexRatingsDto>(`/api/v1/kiorex/ratings?clinicId=${encodeURIComponent(clinicId)}`),
  });
  const data = q.data;
  return (
    <Card data-testid="kiorex-ratings-card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3 text-base">
          {t("kiorexTab.ratings.title", "Ratings & reviews")}
          {data?.overall.averageRating != null ? (
            <span className="flex items-center gap-2 text-sm font-normal">
              <Stars value={data.overall.averageRating} />
              <span className="ltr-nums">
                {data.overall.averageRating.toFixed(2)} · {t("kiorexTab.ratings.count", "{{count}} reviews", { count: data.overall.reviewCount })}
              </span>
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>
          {t(
            "kiorexTab.ratings.hint",
            "Only patients who completed a visit can review. Kiorex sends the invitation and moderates reviews; you can reply here.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data && data.doctors.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.doctors.map((d) => (
              <li key={d.clinicianId} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{d.clinicianName}</span>
                <span className="flex items-center gap-2 ltr-nums">
                  <Stars value={d.averageRating} /> {d.averageRating.toFixed(2)} ({d.reviewCount})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("kiorexTab.ratings.empty", "No Kiorex reviews yet.")}</p>
        )}
        {data && data.reviews.length > 0 ? (
          <ul className="space-y-2">
            {data.reviews.map((r) => (
              <ReviewRow key={r.id} clinicId={clinicId} review={r} />
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
