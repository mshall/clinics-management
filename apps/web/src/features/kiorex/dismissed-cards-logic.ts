/** Per-user card dismissal: stored on the server (follows the user across browsers) with browser storage as the fallback and the one-time migration source. */
export const HOME_CARD_KEY = "kiorex.homeCard";
const localKey = (userId: string) => `kiorex.homeCard.dismissed.${userId}`;

export const readLocalDismissed = (userId: string): boolean => { try { return window.localStorage.getItem(localKey(userId)) === "1"; } catch { return false; } };
export const writeLocalDismissed = (userId: string, on: boolean): void => { try { if (on) window.localStorage.setItem(localKey(userId), "1"); else window.localStorage.removeItem(localKey(userId)); } catch { /* storage blocked: the server copy still applies */ } };

export const withKey = (keys: string[], key: string, on: boolean): string[] => { const s = new Set(keys); if (on) s.add(key); else s.delete(key); return [...s].sort(); };
/** First load after the change: a browser-only dismissal the server does not know yet is pushed up once. */
export const needsMigration = (serverKeys: string[], localDismissed: boolean, key = HOME_CARD_KEY): boolean => localDismissed && !serverKeys.includes(key);

