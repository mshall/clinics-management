import type { DemoRole } from "@/lib/roles";
import { effectiveNavKeys, orderedNavKeysForRole } from "@/lib/nav-policy";
import { FEATURE_SECTION_BY_NAV } from "@/features/guide/guide-feature-flows";
import { guideForRole, type RoleGuide } from "@/features/guide/role-guide-content";

export function enhancedGuideForRole(
  role: DemoRole | undefined,
  navTabKeys?: string[] | null,
  roleNavTabKeys?: string[] | null,
): RoleGuide {
  const base = guideForRole(role);
  if (!role) return base;

  const ordered = orderedNavKeysForRole(role, roleNavTabKeys).filter((k) => k !== "profile");
  const effective = effectiveNavKeys(role, navTabKeys, roleNavTabKeys);
  const keys = ordered.filter((k) => effective.has(k));

  const seen = new Set(base.sections.map((s) => s.id));
  const extras = keys
    .map((k) => FEATURE_SECTION_BY_NAV[k])
    .filter((sec): sec is NonNullable<typeof sec> => {
      if (!sec) return false;
      if (seen.has(sec.id)) return false;
      return true;
    })
    .map((sec) => {
      seen.add(sec.id);
      return sec;
    });

  return {
    ...base,
    sections: [...base.sections, ...extras],
  };
}