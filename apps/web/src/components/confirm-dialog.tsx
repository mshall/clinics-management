import { CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  variant?: "destructive" | "default";
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  pending = false,
  variant = "destructive",
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby="confirm-dialog-description"
      >
        <div
          className={cn(
            "border-b px-6 py-5",
            variant === "destructive"
              ? "border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10 dark:from-destructive/10 dark:to-destructive/5"
              : "border-border bg-muted/40",
          )}
        >
          <DialogHeader className="space-y-3 text-start">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full ring-4",
                variant === "destructive"
                  ? "bg-destructive/15 text-destructive ring-destructive/10"
                  : "bg-muted text-foreground ring-muted",
              )}
            >
              <CircleX className="h-5 w-5" aria-hidden />
            </div>
            <DialogTitle className="text-start text-xl">{title}</DialogTitle>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p id="confirm-dialog-description" className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={variant === "destructive" ? "destructive" : "default"}
              disabled={pending}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
