import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrgHierarchyMindMap } from "@/features/org-hierarchy/org-hierarchy-mindmap";
import type { OrgHierarchyNode } from "@/features/org-hierarchy/org-hierarchy-types";
import { apiGet } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

type OrgHierarchyPanelProps = {
  scope: "platform" | "tenant";
  /** When set, platform scope shows a single organization subtree. */
  tenantId?: string;
  onSelectNode?: (node: OrgHierarchyNode) => void;
  selectedId?: string;
  className?: string;
};

export function OrgHierarchyPanel({ scope, tenantId, onSelectNode, selectedId, className }: OrgHierarchyPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const role = useAuthStore((s) => s.user?.role);
  /** Organization admins always see their tenant tree, never the platform-wide map. */
  const effectiveScope = role === "platform_super_admin" ? scope : "tenant";
  const effectiveTenantId = effectiveScope === "platform" ? tenantId : undefined;

  const hierarchyQuery = useQuery({
    queryKey: ["org-hierarchy", effectiveScope, effectiveTenantId ?? "all"],
    queryFn: () => {
      if (effectiveScope === "platform") {
        const q = effectiveTenantId ? `?tenantId=${encodeURIComponent(effectiveTenantId)}` : "";
        return apiGet<OrgHierarchyNode>(`/api/v1/admin/platform/hierarchy${q}`);
      }
      return apiGet<OrgHierarchyNode>("/api/v1/admin/org-hierarchy");
    },
    enabled: open,
  });

  const root = hierarchyQuery.data;

  return (
    <>
      <Button type="button" variant="outline" size="sm" className={className} onClick={() => setOpen(true)}>
        <GitBranch className="size-4" />
        {t("orgHierarchy.showTree")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex h-[80vh] w-[80vw] max-h-[80vh] max-w-[80vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[80vw]"
          aria-describedby={undefined}
        >
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle>{t("orgHierarchy.title")}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {effectiveScope === "platform" && !effectiveTenantId
                ? t("orgHierarchy.platformHint")
                : t("orgHierarchy.orgHint")}
            </p>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
            {hierarchyQuery.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : hierarchyQuery.isError ? (
              <p className="text-sm text-destructive">{t("common.error")}</p>
            ) : root ? (
              <OrgHierarchyMindMap
                root={root}
                selectedId={selectedId}
                onSelect={(node) => {
                  onSelectNode?.(node);
                  if (node.nodeType === "organization" || node.nodeType === "clinic" || node.nodeType === "user") {
                    setOpen(false);
                  }
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
