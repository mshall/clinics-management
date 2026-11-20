import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { isPickListPortalTarget } from "@/lib/pick-list-portal";
import { cn } from "@/lib/utils";

function DialogCloseLabel() {
  const { t } = useTranslation();
  return <span className="sr-only">{t("common.close")}</span>;
}

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      onPointerDownOutside={(e) => {
        if (isPickListPortalTarget(e.target)) e.preventDefault();
      }}
      onFocusOutside={(e) => {
        if (isPickListPortalTarget(e.target)) e.preventDefault();
      }}
      onInteractOutside={(e) => {
        if (isPickListPortalTarget(e.target)) e.preventDefault();
      }}
      className={cn(
        // Desktop: centred card. < sm: bottom sheet (full width, rounded top, safe-area padding) so thumbs reach the actions.
        "kx-dialog fixed left-1/2 top-1/2 z-50 grid w-[min(100%-2rem,28rem)] max-h-[min(90dvh,40rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-6 shadow-kx-4 touch-manipulation",
        "max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:w-full max-sm:max-h-[92dvh] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:p-5 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        className
      )}
      {...props}
    >
      <span aria-hidden className="mx-auto -mt-2 hidden h-1 w-10 rounded-full bg-border max-sm:block" />
      {children}
      <DialogPrimitive.Close className="absolute inset-e-3 top-3 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground ring-offset-background transition-colors hover:bg-muted hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none touch-manipulation">
        <X className="h-4 w-4" />
        <DialogCloseLabel />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 pe-10 text-start", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-snug tracking-tight", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  // Sticky (see .kx-dialog-footer in globals.css) so primary/secondary actions stay reachable when the form scrolls.
  <div className={cn("kx-dialog-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:min-h-11 sm:[&>button]:min-h-10", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose };
