import { BookOpen, PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { guideForRole } from "@/features/guide/role-guide-content";
import { useAuthStore } from "@/stores/auth-store";
import { useHelpStore } from "@/stores/help-store";
import { HELP_VIDEOS, helpVideoUrl, tourGroupForRole } from "./help-content";
import { useSamplePatient } from "./use-sample-patient";

/** In-app help (ON-08): role guide pages, 60-second Arabic videos, tour restart and sample patient. */
export function HelpDrawer() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const open = useHelpStore((s) => s.drawerOpen);
  const setOpen = useHelpStore((s) => s.setDrawerOpen);
  const setTourOpen = useHelpStore((s) => s.setTourOpen);
  const hasTour = tourGroupForRole(user?.role) != null;
  const { sample, create, remove } = useSamplePatient(open && hasTour);
  const ar = i18n.language.startsWith("ar");
  const guide = guideForRole(user?.role);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="end-0 start-auto w-[min(100%,24rem)] overflow-y-auto" aria-describedby={undefined} data-testid="help-drawer">
        <SheetHeader>
          <SheetTitle>{t("help.title")}</SheetTitle>
          <p className="text-sm text-muted-foreground">{t("help.subtitle")}</p>
        </SheetHeader>
        <div className="space-y-6 p-4">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t("help.guideTitle")}</h3>
            <ul className="space-y-1 text-sm">
              {guide.sections.map((s) => (
                <li key={s.id}>
                  <Link to={`/guide#${s.id}`} onClick={close} className="flex items-center gap-2 underline-offset-2 hover:underline">
                    <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                    {ar ? s.titleAr : s.titleEn}
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/guide" onClick={close} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
              {t("help.fullGuide")}
            </Link>
          </section>

          <section className="space-y-2" data-testid="help-videos">
            <h3 className="text-sm font-semibold">{t("help.videosTitle")}</h3>
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

          {hasTour ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t("help.practiceTitle")}</h3>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  close();
                  setTourOpen(true);
                }}
                data-testid="help-restart-tour"
              >
                {t("help.restartTour")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("help.sample.explain")}</p>
              {sample ? (
                <div className="flex gap-2">
                  <Button asChild variant="outline" className="flex-1">
                    <Link to={`/patients/${sample.patientId}`} onClick={close}>
                      {t("help.sample.open")}
                    </Link>
                  </Button>
                  <Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate()} data-testid="help-sample-remove">
                    {t("help.sample.remove")}
                  </Button>
                </div>
              ) : (
                <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: close })} data-testid="help-sample-try">
                  {t("help.sample.try")}
                </Button>
              )}
              {create.error || remove.error ? (
                <p className="text-sm text-destructive">{((create.error ?? remove.error) as Error).message}</p>
              ) : null}
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
