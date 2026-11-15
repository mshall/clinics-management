/** Dev-only in-memory store keyed by secretRef (never persisted to DB). */
const localSecrets = new Map<string, string>();

export function putLocalFiscalSecret(secretRef: string, secretJson: string): void {
  if (process.env.NODE_ENV === "production" && process.env.KIORLY_DEPLOY_TARGET === "aws") {
    throw new Error("Local fiscal secrets are not allowed in AWS production");
  }
  localSecrets.set(secretRef, secretJson);
}

export function getLocalFiscalSecret(secretRef: string): string | null {
  if (!secretRef.startsWith("local:")) return null;
  return localSecrets.get(secretRef) ?? null;
}

export function buildLocalFiscalSecretRef(tenantId: string, providerKey: string, serial: string): string {
  return `local:kiorly/${tenantId}/fiscal/${providerKey}/${serial}`;
}

export function buildAwsFiscalSecretRef(tenantId: string, providerKey: string, serial: string): string {
  return `kiorly/${tenantId}/fiscal/${providerKey}/${serial}`;
}