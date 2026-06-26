import { useEffect, useRef, useState } from "react";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cropMimeTypeForFileName, getCroppedImageFile } from "@/lib/crop-image";

type ImageCropDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  fileName: string;
  contentType?: string;
  pending?: boolean;
  onApply: (file: File, crop: PixelCrop) => Promise<void>;
};

function defaultCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 80 }, 1, width, height),
    width,
    height,
  );
}

export function ImageCropDialog({
  open,
  onOpenChange,
  imageUrl,
  fileName,
  contentType,
  pending = false,
  onApply,
}: ImageCropDialogProps) {
  const { t } = useTranslation();
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setCrop(undefined);
      setPixelCrop(null);
      setConfirmOpen(false);
    }
  }, [open, imageUrl]);

  const onImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setCrop(defaultCrop(img.width, img.height));
  };

  const requestApply = () => {
    if (!pixelCrop || pixelCrop.width < 4 || pixelCrop.height < 4) return;
    setConfirmOpen(true);
  };

  const confirmApply = async () => {
    if (!pixelCrop) return;
    const img = imgRef.current;
    if (!img) return;
    const mime = cropMimeTypeForFileName(fileName, contentType);
    const file = await getCroppedImageFile(img, pixelCrop, fileName, mime);
    await onApply(file, pixelCrop);
    setConfirmOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("patients.cropDocumentTitle", "Crop image")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("patients.cropDocumentHint", "Drag the corners to select the area you want to keep.")}
          </p>
          <div className="flex justify-center rounded-md border border-border bg-muted/20 p-2">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setPixelCrop(c)}
              className="max-h-[60vh]"
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt={fileName}
                onLoad={onImageLoad}
                className="max-h-[60vh] max-w-full object-contain"
              />
            </ReactCrop>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending || !pixelCrop || pixelCrop.width < 4 || pixelCrop.height < 4}
              onClick={requestApply}
            >
              {t("patients.applyCrop", "Apply crop")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!pending) setConfirmOpen(next);
        }}
        title={t("patients.cropConfirmTitle", "Apply crop?")}
        description={t(
          "patients.cropConfirmBody",
          "The image will be cropped to your selection and the original file will be replaced. Continue?",
        )}
        confirmLabel={t("patients.cropConfirmAction", "Crop and save")}
        cancelLabel={t("common.cancel", "Cancel")}
        pending={pending}
        onConfirm={() => void confirmApply()}
      />
    </>
  );
}
