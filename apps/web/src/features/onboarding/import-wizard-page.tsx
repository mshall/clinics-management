import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Undo2, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/http";
import {
  IMPORT_ENTITIES,
  commitImport,
  downloadImportErrorReport,
  downloadImportTemplate,
  getImport,
  listImports,
  undoImport,
  uploadImport,
  type DedupeMode,
  type ImportEntity,
  type ImportJobDto,
} from "@/lib/imports-api";

export function ImportWizardPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [entity, setEntity] = useState<ImportEntity>("PATIENTS");
  const [dedupeMode, setDedupeMode] = useState<DedupeMode>("SKIP");
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const history = useQuery({ queryKey: ["imports"], queryFn: listImports });
  const job = useQuery({
    queryKey: ["imports", jobId],
    queryFn: () => getImport(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data?.status === "COMMITTING" ? 1500 : false),
  });

  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("imports.failed"));
  const upload = useMutation({
    mutationFn: () => uploadImport(entity, file!, dedupeMode),
    onSuccess: (data) => {
      setJobId(data.id);
      qc.setQueryData(["imports", data.id], data);
      void qc.invalidateQueries({ queryKey: ["imports"], exact: true });
    },
    onError,
  });
  const commit = useMutation({
    mutationFn: (id: string) => commitImport(id, dedupeMode),
    onSuccess: (data) => qc.setQueryData(["imports", data.id], data),
    onError,
  });
  const undo = useMutation({
    mutationFn: (id: string) => undoImport(id),
    onSuccess: (data) => {
      qc.setQueryData(["imports", data.id], data);
      void qc.invalidateQueries({ queryKey: ["imports"], exact: true });
      toast.success(t("imports.undone", { deleted: data.undo?.deleted ?? 0, kept: data.undo?.kept ?? 0 }));
    },
    onError,
  });

  const current = job.data;

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="size-5" aria-hidden />
            {t("imports.title")}
          </CardTitle>
          <CardDescription>{t("imports.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("imports.whatToImport")}</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {IMPORT_ENTITIES.map((e) => (
                <Button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={entity === e}
                  variant={entity === e ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setEntity(e);
                    setJobId(null);
                  }}
                >
                  {t(`imports.entity.${e}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void downloadImportTemplate(entity, "ar")}>
              <Download className="me-1 size-4" aria-hidden />
              {t("imports.templateAr")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void downloadImportTemplate(entity, "en")}>
              <Download className="me-1 size-4" aria-hidden />
              {t("imports.templateEn")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("imports.formatHint")}</p>
          {entity === "PATIENTS" ? (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">{t("imports.dedupeTitle")}</legend>
              {(["SKIP", "MERGE"] as const).map((m) => (
                <label key={m} className="flex items-start gap-2 text-sm">
                  <input type="radio" name="dedupe" checked={dedupeMode === m} onChange={() => setDedupeMode(m)} className="mt-1" />
                  <span>{t(`imports.dedupe.${m}`)}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <input
              data-testid="import-file"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <Button type="button" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
              <Upload className="me-1 size-4" aria-hidden />
              {upload.isPending ? t("imports.validating") : t("imports.validate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {current ? (
        <JobCard
          job={current}
          committing={commit.isPending}
          undoing={undo.isPending}
          onCommit={() => commit.mutate(current.id)}
          onUndo={() => undo.mutate(current.id)}
        />
      ) : null}

      {history.data?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("imports.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("imports.col.file")}</TableHead>
                  <TableHead>{t("imports.col.type")}</TableHead>
                  <TableHead>{t("imports.col.status")}</TableHead>
                  <TableHead>{t("imports.col.rows")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.data.map((j) => (
                  <TableRow key={j.id} className="cursor-pointer" onClick={() => setJobId(j.id)}>
                    <TableCell className="max-w-[16rem] truncate">{j.fileName}</TableCell>
                    <TableCell>{t(`imports.entity.${j.entity}`)}</TableCell>
                    <TableCell>{t(`imports.status.${j.status}`)}</TableCell>
                    <TableCell>{j.createdRows || j.okRows}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function JobCard({
  job,
  committing,
  undoing,
  onCommit,
  onUndo,
}: {
  job: ImportJobDto;
  committing: boolean;
  undoing: boolean;
  onCommit: () => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const missing = job.failureMessage?.startsWith("MISSING_COLUMNS:") ? job.failureMessage.slice(16) : null;
  return (
    <Card data-testid="import-job">
      <CardHeader>
        <CardTitle className="text-base">
          {job.fileName} · <span data-testid="import-status">{t(`imports.status.${job.status}`)}</span>
        </CardTitle>
        <CardDescription>
          {t("imports.summary", {
            total: job.totalRows,
            ok: job.okRows,
            errors: job.errorRows,
            duplicates: job.duplicateRows,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {missing ? <p className="text-sm text-destructive">{t("imports.missingColumns", { columns: missing })}</p> : null}
        {job.status === "DONE" ? (
          <p className="text-sm">{t("imports.done", { created: job.createdRows, merged: job.mergedRows })}</p>
        ) : null}
        {job.duplicateRows > 0 && job.status === "READY" ? (
          <p className="text-sm text-muted-foreground">{t(`imports.dedupeNote.${job.dedupeMode}`, { count: job.duplicateRows })}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {job.status === "READY" && job.okRows > 0 ? (
            <Button type="button" disabled={committing} onClick={onCommit}>
              {t("imports.commit", { count: job.okRows })}
            </Button>
          ) : null}
          {job.status === "COMMITTING" ? <p className="text-sm">{t("imports.committing")}</p> : null}
          {job.hasErrorReport ? (
            <Button type="button" variant="outline" onClick={() => void downloadImportErrorReport(job.id, job.entity)}>
              <Download className="me-1 size-4" aria-hidden />
              {t("imports.errorReport")}
            </Button>
          ) : null}
          {job.canUndo ? (
            <Button type="button" variant="outline" disabled={undoing} onClick={onUndo}>
              <Undo2 className="me-1 size-4" aria-hidden />
              {t("imports.undo")}
            </Button>
          ) : null}
        </div>
        {job.canUndo ? <p className="text-xs text-muted-foreground">{t("imports.undoHint")}</p> : null}
        {job.errors?.length ? (
          <Table data-testid="import-errors">
            <TableHeader>
              <TableRow>
                <TableHead>{t("imports.col.row")}</TableHead>
                <TableHead>{t("imports.col.field")}</TableHead>
                <TableHead>{t("imports.col.error")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.errors.slice(0, 100).map((e, i) => (
                <TableRow key={`${e.row}-${e.field}-${i}`}>
                  <TableCell>{e.row}</TableCell>
                  <TableCell>{e.field}</TableCell>
                  <TableCell>{t(`imports.error.${e.code}`, { defaultValue: e.code })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  );
}
