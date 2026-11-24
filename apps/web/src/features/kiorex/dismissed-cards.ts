import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/http";
import { HOME_CARD_KEY, needsMigration, readLocalDismissed, withKey, writeLocalDismissed } from "./dismissed-cards-logic";

export const dismissedQueryKey = ["me", "preferences", "dismissed-cards"] as const;
export function useHomeCardDismissed(userId: string | undefined): { dismissed: boolean; setDismissed: (on: boolean) => void } {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...dismissedQueryKey, userId], queryFn: () => apiGet<{ keys: string[] }>("/api/v1/me/preferences/dismissed-cards"), enabled: Boolean(userId), retry: false, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: (keys: string[]) => apiPut<{ keys: string[] }>("/api/v1/me/preferences/dismissed-cards", { keys }),
    onSuccess: (d) => qc.setQueryData([...dismissedQueryKey, userId], d),
  });
  const serverKeys = q.data?.keys;
  const mutate = save.mutate;
  useEffect(() => {
    if (!userId || !serverKeys) return;
    if (needsMigration(serverKeys, readLocalDismissed(userId))) mutate(withKey(serverKeys, HOME_CARD_KEY, true), { onSuccess: () => writeLocalDismissed(userId, false) });
    else if (serverKeys.includes(HOME_CARD_KEY) && readLocalDismissed(userId)) writeLocalDismissed(userId, false);
  }, [userId, serverKeys, mutate]);
  const setDismissed = useCallback((on: boolean) => {
    if (!userId) return;
    writeLocalDismissed(userId, on); // immediate and survives a failed request
    const next = withKey(serverKeys ?? [], HOME_CARD_KEY, on);
    qc.setQueryData([...dismissedQueryKey, userId], { keys: next });
    mutate(next, { onSuccess: () => { if (!on) writeLocalDismissed(userId, false); } });
  }, [userId, serverKeys, qc, mutate]);
  const dismissed = userId ? (serverKeys ? serverKeys.includes(HOME_CARD_KEY) || readLocalDismissed(userId) : readLocalDismissed(userId)) : true;
  return { dismissed, setDismissed };
}
