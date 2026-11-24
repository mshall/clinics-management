import { OnboardingChecklist } from "@/features/onboarding/onboarding-checklist";
import { useAuthStore } from "@/stores/auth-store";

/** Roles that see the quick-setup card; a step the role cannot perform shows who can ("Ask the owner"), never a dead click. */
const SETUP_ROLES = new Set(["group_admin", "clinic_admin", "branch_manager", "physician"]);

export function OnboardingChecklistCard() {
  const user = useAuthStore((s) => s.user);
  const visible = Boolean(user?.isTenantOwner) || (user?.role ? SETUP_ROLES.has(user.role) : false);
  if (!visible) return null;
  // Dismissal is remembered per organisation on the server (it only applies once every step is done or skipped).
  return <OnboardingChecklist variant="card" />;
}
