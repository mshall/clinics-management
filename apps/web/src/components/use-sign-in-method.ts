import { useState } from "react";
import { readSignInMethod, type SignInMethod } from "@/lib/sign-in-method";
import { resolveInitialMethod } from "@/lib/sign-in-default";

/**
 * `offered`: whether the API offers Kiorex Passport (`undefined` while `/auth/config` is still loading).
 * `apiDefault`: the API's `defaultMethod` for the identified organisation, or the deployment default (see lib/sign-in-default.ts for the order).
 * `ready` is false only while the config loads for someone whose last method was not the password: render a placeholder instead of flashing the wrong method.
 */
export function useSignInMethod(offered: boolean | undefined, apiDefault?: unknown) {
  const [stored] = useState<SignInMethod | null>(() => readSignInMethod());
  const [chosen, setChosen] = useState<SignInMethod | null>(null);
  let method: SignInMethod;
  if (offered === false) method = "password";
  else if (offered === true) method = chosen ?? resolveInitialMethod({ passportOffered: true, remembered: stored, apiDefault });
  else method = chosen ?? (stored === "passport" ? "passport" : "password");
  return { method, ready: offered !== undefined || stored === "password" || chosen !== null, offered: offered === true, choose: setChosen };
}
