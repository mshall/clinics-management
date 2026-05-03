import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";

function usePersistHydrated(): boolean {
  const [ready, setReady] = useState(() => {
    const p = useAuthStore.persist;
    return typeof p.hasHydrated === "function" ? p.hasHydrated() : true;
  });
  useEffect(() => {
    const p = useAuthStore.persist;
    if (typeof p.hasHydrated === "function" && p.hasHydrated()) {
      setReady(true);
    }
    const unsub = p.onFinishHydration?.(() => setReady(true));
    return () => {
      unsub?.();
    };
  }, []);
  return ready;
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
