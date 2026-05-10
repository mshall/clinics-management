import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { router } from "@/app/router";
import "@/lib/i18n";
import "@/styles/globals.css";
import { applyThemeFromPersistedStorage } from "@/stores/theme-store";

/** Default IANA timezone for clinic operations (Frankfurt); matches AWS eu-central-1 + RDS. */
export const APP_TIME_ZONE = "Europe/Berlin";

applyThemeFromPersistedStorage();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors closeButton position="top-center" />
    </QueryClientProvider>
  </StrictMode>
);
