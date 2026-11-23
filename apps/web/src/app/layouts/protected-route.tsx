import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";

function subscribePersistHydration(onChange: () => void): () => void {
  const unsub = useAuthStore.persist.onFinishHydration?.(onChange);
  return () => {
    unsub?.();
  };
}

function getPersistHydrated(): boolean {
  const p = useAuthStore.persist;
  return typeof p.hasHydrated === "function" ? p.hasHydrated() : true;
}

function usePersistHydrated(): boolean {
  return useSyncExternalStore(subscribePersistHydration, getPersistHydrated, getPersistHydrated);
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const hydrated = usePersistHydrated();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (!user || !token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
