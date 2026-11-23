/**
 * The staff web logins offer exactly two sign-in methods: "Sign in with Kiorex Passport" (the default) and "Password".
 * The last method that actually signed the user in is remembered per origin (localStorage) and preselected next time.
 * Without a valid memory, or when the API does not offer Passport (`/auth/config`), it falls back to Passport (when offered) or Password.
 * Kept free of React and of globals so it is unit-testable with `node --test`.
 */
export type SignInMethod = "passport" | "password";
export const SIGN_IN_METHOD_KEY = "kiorly.signin.method";

export const parseSignInMethod = (v: unknown): SignInMethod | null => (v === "passport" || v === "password" ? v : null);

/** Passport is the default whenever it is offered; a stored `password` wins only when Passport is offered AND the user last used the password. */
export function resolveSignInMethod(passportOffered: boolean, stored: unknown): SignInMethod {
  if (!passportOffered) return "password";
  return parseSignInMethod(stored) ?? "passport";
}

type Store = Pick<Storage, "getItem" | "setItem">;
const defaultStore = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export function readSignInMethod(store: Store | null = defaultStore()): SignInMethod | null {
  try { return parseSignInMethod(store?.getItem(SIGN_IN_METHOD_KEY)); } catch { return null; }
}
/** Call after a sign-in succeeded with `method`. Storage may be blocked (private mode): the memory is then simply not kept. */
export function rememberSignInMethod(method: SignInMethod, store: Store | null = defaultStore()): void {
  try { store?.setItem(SIGN_IN_METHOD_KEY, method); } catch { /* ignore */ }
}
