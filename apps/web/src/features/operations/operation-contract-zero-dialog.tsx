import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type OperationContractZeroDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, confirm marks the operation as contract and continues. */
  onConfirmContract: () => void;
};

/**
 * Rich warning when fee editors try to save total cost = 0 without the Contract (تعاقد) flag.
 * Confirm stays disabled until the contract checkbox is checked.
 */
export function OperationContractZeroDialog({
  open,
  onOpenChange,
  onConfirmContract,
}: OperationContractZeroDialogProps) {
  const { t } = useTranslation();
  const [markAsContract, setMarkAsContract] = useState(false);

  useEffect(() => {
    if (open) setMarkAsContract(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-describedby="operation-contract-zero-description"
      >
        <div className="border-b border-amber-500/25 bg-linear-to-br from-amber-500/10 via-amber-500/5 to-transparent px-6 py-5 dark:from-amber-500/15 dark:via-amber-900/10">
          <DialogHeader className="space-y-3 text-start">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/20 text-amber-800 ring-4 ring-amber-500/10 dark:text-amber-200">
              <FileSignature className="h-5 w-5" aria-hidden />
            </div>
            <DialogTitle className="text-start text-xl">
              {t("operations.contractZeroTitle", "Zero cost needs a contract")}
            </DialogTitle>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p
            id="operation-contract-zero-description"
            className="text-sm leading-relaxed text-muted-foreground"
          >
            {t(
              "operations.contractZeroBody",
              "Operation total cost cannot be zero unless this is a contract case (تعاقد). Enter a positive amount, or you can check the operation as a contract below.",
            )}
          </p>
          <label
            htmlFor="operation-contract-zero-checkbox"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          >
            <input
              id="operation-contract-zero-checkbox"
              type="checkbox"
              className="mt-1 size-4 shrink-0 rounded border-input"
              checked={markAsContract}
              onChange={(e) => setMarkAsContract(e.target.checked)}
              data-testid="operation-contract-zero-checkbox"
            />
            <span className="min-w-0 space-y-1">
              <span className="block font-semibold">
                {t("operations.contractZeroCheckbox", "This operation is a contract")}{" "}
                <span className="font-normal text-muted-foreground">
                  ({t("operations.contractLabelAr", "تعاقد")})
                </span>
              </span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                {t(
                  "operations.contractZeroHint",
                  "Contract operations are filterable in the Operations list and in Reports channel revenue.",
                )}
              </span>
            </span>
          </label>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              disabled={!markAsContract}
              data-testid="operation-contract-zero-confirm"
              onClick={() => {
                onConfirmContract();
                onOpenChange(false);
              }}
            >
              {t("operations.contractZeroConfirm", "Mark as contract & continue")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
