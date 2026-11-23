/** Session id (`sid`) claim of the access token, or null. */
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  try {
    const part = token?.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { sid?: unknown };
    return typeof json.sid === "string" && json.sid ? json.sid : null;
  } catch {
    return null;
  }
}
