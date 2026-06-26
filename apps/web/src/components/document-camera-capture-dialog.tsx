import { Camera } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { captureStillPhoto, openCameraStream } from "@/lib/camera-capture";
import { enhanceCameraCaptureFile } from "@/lib/enhance-image";

type DocumentCameraCaptureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
};

export function DocumentCameraCaptureDialog({ open, onOpenChange, onCapture }: DocumentCameraCaptureDialogProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);

  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      setCameraError(null);
      setProcessing(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const stream = await openCameraStream();
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          const unavailable =
            error instanceof Error && error.message.toLowerCase().includes("not available");
          setCameraError(
            unavailable
              ? t("patients.cameraUnavailable", "Camera is not available in this browser.")
              : t("patients.cameraPermissionDenied", "Could not access the camera. Check permissions and try again."),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream, t]);

  const capture = async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || !ready || processing) return;

    setProcessing(true);
    try {
      const raw = await captureStillPhoto(stream, video);
      const enhanced = await enhanceCameraCaptureFile(raw);
      onCapture(enhanced);
      onOpenChange(false);
    } catch {
      setCameraError(t("patients.cameraCaptureFailed", "Could not capture the photo. Try again."));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !processing && onOpenChange(next)} modal={false}>
      <DialogContent
        className="max-w-lg"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("patients.captureDocument", "Capture document")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {cameraError ? (
            <p className="text-sm text-destructive">{cameraError}</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-black">
              <video
                ref={videoRef}
                className="aspect-[4/3] w-full object-contain"
                playsInline
                muted
              />
            </div>
          )}
          {processing ? (
            <p className="text-center text-sm text-muted-foreground">
              {t("patients.enhancingCapture", "Enhancing photo quality…")}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={processing} onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              disabled={!ready || Boolean(cameraError) || processing}
              className="gap-1"
              onClick={() => void capture()}
            >
              <Camera className="h-4 w-4" />
              {processing ? t("common.loading", "Loading…") : t("patients.takePhoto", "Take photo")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
