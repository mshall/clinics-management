import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveTable } from "@/components/responsive-table";
import { TablePagination } from "@/components/table-pagination";
import { usePatientAllergiesQuery } from "@/lib/api-hooks";
import { allergyLabel, type PatientAllergyCode } from "@/lib/patient-allergies";
import { localeForLanguage } from "@/lib/locale-display";

const PAGE_SIZE = 5;

type Props = {
  patientId: string;
};

export function PatientAllergiesSection({ patientId }: Props) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, isPending } = usePatientAllergiesQuery(patientId, page, PAGE_SIZE);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {t("patients.allergiesSection", "Allergies")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isPending ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : items.length === 0 && total === 0 ? (
          <p className="text-muted-foreground">{t("patients.noAllergies", "No allergies recorded.")}</p>
        ) : (
          <>
            <ResponsiveTable>
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium text-muted-foreground">
                      {t("patients.allergyColumn", "Allergy")}
                    </th>
                    <th className="px-3 py-2 text-start font-medium text-muted-foreground">
                      {t("patients.allergyNotes", "Notes")}
                    </th>
                    <th className="px-3 py-2 text-start font-medium text-muted-foreground">
                      {t("patients.allergyRecorded", "Recorded")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">
                        {row.code === "OTHER"
                          ? t("patients.allergy.OTHER", "Other")
                          : allergyLabel(row.code as PatientAllergyCode, t)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{row.otherComment ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground ltr-nums">
                        {new Date(row.createdAt).toLocaleString(localeForLanguage(i18n.language))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
            <TablePagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              totalPages={totalPages}
              disabled={isPending}
              onPageChange={setPage}
              onPageSizeChange={() => setPage(1)}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
