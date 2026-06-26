import { ChevronLeft, ChevronRight, FlipHorizontal, ZoomIn, ZoomOut } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;
const SWIPE_THRESHOLD_PX = 48;

type Point = { x: number; y: number };

type ZoomableImageProps = {
  src: string;
  alt: string;
  className?: string;
  viewportClassName?: string;
  loading?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  canPrevious?: boolean;
  canNext?: boolean;
  slideLabel?: string;
};

function pointerDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function ZoomableImage({
  src,
  alt,
  className,
  viewportClassName,
  loading = false,
  onPrevious,
  onNext,
  canPrevious = Boolean(onPrevious),
  canNext = Boolean(onNext),
  slideLabel,
}: ZoomableImageProps) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);
  const singlePointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    mode: "pan" | "swipe";
  } | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [flipped, setFlipped] = useState(false);

  const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setFlipped(false);
  }, []);

  useEffect(() => {
    resetView();
    pointersRef.current.clear();
    pinchRef.current = null;
    singlePointerRef.current = null;
  }, [src, resetView]);

  const stopToolbarClick = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const zoomBy = useCallback((delta: number) => {
    setScale((current) => clampScale(Number((current + delta).toFixed(2))));
  }, []);

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    zoomBy(delta);
  };

  const syncPinch = () => {
    const points = [...pointersRef.current.values()];
    if (points.length !== 2 || !pinchRef.current) return;
    const distance = pointerDistance(points[0]!, points[1]!);
    const next = pinchRef.current.startScale * (distance / pinchRef.current.startDistance);
    setScale(clampScale(Number(next.toFixed(2))));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (loading) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointersRef.current.size === 1) {
      singlePointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
        mode: scale > 1 ? "pan" : "swipe",
      };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { startDistance: pointerDistance(a!, b!), startScale: scale };
      singlePointerRef.current = null;
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2) {
      syncPinch();
      return;
    }

    const single = singlePointerRef.current;
    if (!single || single.pointerId !== event.pointerId) return;

    if (single.mode === "pan" && scale > 1) {
      setPosition({
        x: single.originX + (event.clientX - single.startX),
        y: single.originY + (event.clientY - single.startY),
      });
    }
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const single = singlePointerRef.current;
    if (single?.pointerId === event.pointerId && single.mode === "swipe" && scale <= 1 && !loading) {
      const dx = event.clientX - single.startX;
      const dy = event.clientY - single.startY;
      if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
        if (dx < 0 && canNext) onNext?.();
        else if (dx > 0 && canPrevious) onPrevious?.();
      }
    }

    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 1) {
      const remaining = [...pointersRef.current.entries()][0];
      if (remaining) {
        const [pointerId, point] = remaining;
        singlePointerRef.current = {
          pointerId,
          startX: point.x,
          startY: point.y,
          originX: position.x,
          originY: position.y,
          mode: scale > 1 ? "pan" : "swipe",
        };
      }
    } else {
      singlePointerRef.current = null;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const showGalleryNav = Boolean(onPrevious || onNext);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {showGalleryNav ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label={t("common.previousImage", "Previous image")}
              disabled={!canPrevious || loading}
              onClick={onPrevious}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {slideLabel ? (
              <span className="min-w-[4.5rem] text-center text-xs text-muted-foreground ltr-nums">{slideLabel}</span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label={t("common.nextImage", "Next image")}
              disabled={!canNext || loading}
              onClick={onNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="hidden h-6 w-px bg-border sm:inline" aria-hidden />
          </>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t("common.zoomOut", "Zoom out")}
          disabled={loading}
          onClick={(event) => {
            stopToolbarClick(event);
            zoomBy(-ZOOM_STEP);
          }}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("h-8 w-8", flipped && "border-primary text-primary")}
          aria-label={t("common.flipHorizontal", "Flip horizontally")}
          aria-pressed={flipped}
          disabled={loading}
          onClick={(event) => {
            stopToolbarClick(event);
            setFlipped((current) => !current);
          }}
        >
          <FlipHorizontal className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={t("common.zoomIn", "Zoom in")}
          disabled={loading}
          onClick={(event) => {
            stopToolbarClick(event);
            zoomBy(ZOOM_STEP);
          }}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <button
          type="button"
          className="min-w-[3rem] rounded px-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50 ltr-nums"
          aria-label={t("common.zoomReset", "Reset zoom")}
          title={t("common.zoomReset", "Reset zoom")}
          disabled={loading}
          onClick={(event) => {
            stopToolbarClick(event);
            resetView();
          }}
        >
          {Math.round(scale * 100)}%
        </button>
      </div>
      <div className="relative">
        {showGalleryNav ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute start-2 top-1/2 z-10 h-9 w-9 -translate-y-1/2 shadow-md"
              aria-label={t("common.previousImage", "Previous image")}
              disabled={!canPrevious || loading}
              onClick={onPrevious}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute end-2 top-1/2 z-10 h-9 w-9 -translate-y-1/2 shadow-md"
              aria-label={t("common.nextImage", "Next image")}
              disabled={!canNext || loading}
              onClick={onNext}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        ) : null}
        <div
          ref={viewportRef}
          className={cn(
            "flex min-h-[50vh] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20 touch-none select-none",
            scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            viewportClassName,
          )}
          style={{ touchAction: "none" }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <img
              src={src}
              alt={alt}
              draggable={false}
              className="max-h-[70vh] max-w-full object-contain"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${flipped ? -scale : scale}, ${scale})`,
                transformOrigin: "center center",
                willChange: "transform",
              }}
            />
          )}
        </div>
      </div>
      {showGalleryNav ? (
        <p className="text-center text-xs text-muted-foreground">
          {t("common.gallerySwipeHint", "Swipe left or right, or use the arrows, to browse images. Pinch to zoom.")}
        </p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          {t("common.pinchZoomHint", "Pinch to zoom. Drag when zoomed in. Click zoom % to reset.")}
        </p>
      )}
    </div>
  );
}
