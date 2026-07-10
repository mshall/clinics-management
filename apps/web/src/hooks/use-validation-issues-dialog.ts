import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorToValidationIssues } from "@/lib/form-validation";

export type ValidationDialogIntent = "submit" | "create" | "save";

type UseValidationIssuesDialogOptions = {
  intent?: ValidationDialogIntent;
  title?: string;
  description?: string;
};

const TITLE_KEYS: Record<ValidationDialogIntent, { key: string; fallback: string }> = {
  submit: {
    key: "validation.cannotSubmitTitle",
    fallback: "Cannot submit yet",
  },
  create: {
    key: "validation.cannotCreateTitle",
    fallback: "Cannot create yet",
  },
  save: {
    key: "validation.cannotSaveTitle",
    fallback: "Cannot save yet",
  },
};

const DESCRIPTION_KEYS: Record<ValidationDialogIntent, { key: string; fallback: string }> = {
  submit: {
    key: "validation.cannotSubmitDescription",
    fallback: "Fix the items below, then try submitting again.",
  },
  create: {
    key: "validation.cannotCreateDescription",
    fallback: "Fix the items below, then try creating again.",
  },
  save: {
    key: "validation.cannotSaveDescription",
    fallback: "Fix the items below, then try saving again.",
  },
};

export function useValidationIssuesDialog(opts: UseValidationIssuesDialogOptions = {}) {
  const { t } = useTranslation();
  const intent = opts.intent ?? "submit";
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [formErr, setFormErr] = useState<string | null>(null);

  const title = useMemo(() => {
    if (opts.title) return opts.title;
    const meta = TITLE_KEYS[intent];
    return t(meta.key, meta.fallback);
  }, [intent, opts.title, t]);

  const description = useMemo(() => {
    if (opts.description) return opts.description;
    const meta = DESCRIPTION_KEYS[intent];
    return t(meta.key, meta.fallback);
  }, [intent, opts.description, t]);

  const showIssues = useCallback((nextIssues: string[]) => {
    if (nextIssues.length === 0) return;
    setIssues(nextIssues);
    setFormErr(nextIssues.join(" "));
    setOpen(true);
  }, []);

  const showError = useCallback(
    (error: unknown) => {
      showIssues(errorToValidationIssues(error));
    },
    [showIssues],
  );

  const clear = useCallback(() => {
    setFormErr(null);
    setIssues([]);
    setOpen(false);
  }, []);

  const dialogProps = useMemo(
    () => ({
      open,
      onOpenChange: setOpen,
      title,
      description,
      issues,
      dismissLabel: t("common.close", "Close"),
    }),
    [description, issues, open, t, title],
  );

  return {
    open,
    setOpen,
    issues,
    formErr,
    setFormErr,
    showIssues,
    showError,
    clear,
    dialogProps,
  };
}
