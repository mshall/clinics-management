import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { router } from "@/app/router";
import "@/lib/i18n";
import "@/styles/globals.css";
import { QUERY_GC, QUERY_STALE } from "@/lib/query-cache-policy";
import { startDeployVersionWatch } from "@/lib/deploy-version-watch";
import { applyThemeFromPersistedStorage } from "@/stores/theme-store";
import { EditionBoot } from "@/features/edition/edition-boot";

/** Default IANA timezone for clinic operations (Frankfurt); matches AWS eu-central-1 + RDS. */
export const APP_TIME_ZONE = "Europe/Berlin";

applyThemeFromPersistedStorage();
startDeployVersionWatch();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE.list,
      gcTime: QUERY_GC,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <EditionBoot />
      <RouterProvider router={router} />
      <Toaster richColors closeButton position="top-center" style={{ zIndex: 9999 }} />
    </QueryClientProvider>
  </StrictMode>
);
