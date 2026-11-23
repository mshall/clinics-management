import { useState } from "react";
import { readSignInMethod, resolveSignInMethod, type SignInMethod } from "@/lib/sign-in-method";

/**
 * `offered`: whether the API offers Kiorex Passport (`undefined` while `/auth/config` is still loading).
 * `ready` is false only while the config loads for someone whose last method was not the password: render a placeholder instead of flashing the wrong method.
 */
export function useSignInMethod(offered: boolean | undefined) {
  const [stored] = useState<SignInMethod | null>(() => readSignInMethod());
  const [chosen, setChosen] = useState<SignInMethod | null>(null);
  let method: SignInMethod;
  if (offered === false) method = "password";
  else if (offered === true) method = chosen ?? resolveSignInMethod(true, stored);
  else method = chosen ?? (stored === "password" ? "password" : "passport");
  return { method, ready: offered !== undefined || stored === "password" || chosen !== null, offered: offered === true, choose: setChosen };
}
