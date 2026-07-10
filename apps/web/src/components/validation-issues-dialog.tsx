import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ValidationIssuesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  issues: string[];
  dismissLabel: string;
};

export function ValidationIssuesDialog({
  open,
  onOpenChange,
  title,
  description,
  issues,
  dismissLabel,
}: ValidationIssuesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby="validation-issues-dialog-description"
      >
        <div className="border-b border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10 px-6 py-5 dark:from-destructive/10 dark:to-destructive/5">
          <DialogHeader className="space-y-3 text-start">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15 text-destructive ring-4 ring-destructive/10">
              <CircleAlert className="h-5 w-5" aria-hidden />
            </div>
            <DialogTitle className="text-start text-xl">{title}</DialogTitle>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p id="validation-issues-dialog-description" className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          {issues.length > 0 ? (
            <ul className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
              {issues.map((issue, index) => (
                <li key={`${index}-${issue}`} className="flex gap-2.5 text-sm text-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" onClick={() => onOpenChange(false)}>
              {dismissLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
