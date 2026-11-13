import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiGet } from "@/lib/http";

type TemplateField = {
  id: string;
  type?: string;
  labelEn?: string;
  labelAr?: string;
  options?: string[];
};

type TemplateSection = {
  id: string;
  titleEn?: string;
  titleAr?: string;
  fields?: TemplateField[];
};

type ClinicalTemplate = {
  id: string;
  name: string;
  specialty: string;
  sectionsJson: unknown;
};

function parseSections(json: unknown): TemplateSection[] {
  if (!Array.isArray(json)) return [];
  return json.filter((s): s is TemplateSection => Boolean(s && typeof s === "object" && "id" in s));
}

function fieldKey(sectionId: string, fieldId: string) {
  return `${sectionId}.${fieldId}`;
}

type Props = {
  disabled?: boolean;
  templateId: string | null;
  responses: Record<string, unknown>;
  onTemplateIdChange: (id: string | null) => void;
  onResponsesChange: (next: Record<string, unknown>) => void;
};

export function EncounterSpecialtyForm({
  disabled,
  templateId,
  responses,
  onTemplateIdChange,
  onResponsesChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  const templatesQuery = useQuery({
    queryKey: ["clinical", "templates"],
    queryFn: () => apiGet<ClinicalTemplate[]>("/api/v1/clinical/form-templates"),
  });

  const selected = (templatesQuery.data ?? []).find((tpl) => tpl.id === templateId);
  const sections = selected ? parseSections(selected.sectionsJson) : [];

  const setField = (key: string, value: unknown) => {
    onResponsesChange({ ...responses, [key]: value });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-[12rem] flex-1 space-y-2">
          <Label htmlFor="clinical-template">{t("clinical.specialtyFormTemplate", "Specialty form template")}</Label>
          <select
            id="clinical-template"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={templateId ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value || null;
              onTemplateIdChange(next);
              if (next !== templateId) onResponsesChange({});
            }}
          >
            <option value="">{t("clinical.noSpecialtyTemplate", "None (SOAP only)")}</option>
            {(templatesQuery.data ?? []).map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} — {tpl.specialty.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <a href="/clinical/templates" className="text-xs text-primary hover:underline">
          {t("clinical.templateBuilderLink", "Open template builder")}
        </a>
      </div>
      {selected && sections.length > 0 ? (
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.id} className="space-y-2">
              <p className="text-sm font-medium">
                {isAr && section.titleAr ? section.titleAr : section.titleEn ?? section.id}
              </p>
              {(section.fields ?? []).map((field) => {
                const key = fieldKey(section.id, field.id);
                const label = isAr && field.labelAr ? field.labelAr : field.labelEn ?? field.id;
                const type = (field.type ?? "text").toLowerCase();
                if (type === "textarea") {
                  return (
                    <div key={key} className="space-y-1">
                      <Label optional>{label}</Label>
                      <Textarea
                        rows={2}
                        disabled={disabled}
                        value={String(responses[key] ?? "")}
                        onChange={(e) => setField(key, e.target.value)}
                      />
                    </div>
                  );
                }
                if (type === "number") {
                  return (
                    <div key={key} className="space-y-1">
                      <Label optional>{label}</Label>
                      <Input
                        type="number"
                        disabled={disabled}
                        value={responses[key] != null ? String(responses[key]) : ""}
                        onChange={(e) => setField(key, e.target.value === "" ? null : Number(e.target.value))}
                      />
                    </div>
                  );
                }
                if (type === "checkbox") {
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 rounded border border-input"
                        disabled={disabled}
                        checked={Boolean(responses[key])}
                        onChange={(e) => setField(key, e.target.checked)}
                      />
                      {label}
                    </label>
                  );
                }
                if (type === "select" && field.options?.length) {
                  return (
                    <div key={key} className="space-y-1">
                      <Label optional>{label}</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        disabled={disabled}
                        value={String(responses[key] ?? "")}
                        onChange={(e) => setField(key, e.target.value)}
                      >
                        <option value="">—</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }
                return (
                  <div key={key} className="space-y-1">
                    <Label optional>{label}</Label>
                    <Input
                      disabled={disabled}
                      value={String(responses[key] ?? "")}
                      onChange={(e) => setField(key, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : templateId ? (
        <p className="text-xs text-muted-foreground">{t("clinical.templateNoSections", "This template has no sections yet.")}</p>
      ) : null}
    </div>
  );
}
