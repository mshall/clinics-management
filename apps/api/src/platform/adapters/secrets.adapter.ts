/**
 * KX-21 §01 secrets adapter: `getSecret(ref)`. The only place that may import the Secrets Manager SDK.
 * Swap the implementation (Azure Key Vault, GCP Secret Manager) without touching callers.
 */
export interface SecretsAdapter {
  /** Returns the raw secret string, or null when missing / unreadable (never throws). */
  getSecret(ref: string): Promise<string | null>;
}

export class AwsSecretsManagerAdapter implements SecretsAdapter {
  async getSecret(ref: string): Promise<string | null> {
    try {
      const sm = await import("@aws-sdk/client-secrets-manager");
      const client = new sm.SecretsManagerClient({});
      const out = await client.send(new sm.GetSecretValueCommand({ SecretId: ref }));
      return out.SecretString?.trim() || null;
    } catch {
      return null;
    }
  }
}

let current: SecretsAdapter = new AwsSecretsManagerAdapter();

export function getSecretsAdapter(): SecretsAdapter {
  return current;
}

/** Test seam. */
export function setSecretsAdapter(adapter: SecretsAdapter): void {
  current = adapter;
}
