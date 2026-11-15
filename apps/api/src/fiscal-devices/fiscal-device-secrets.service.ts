import { PutSecretValueCommand, SecretsManagerClient, CreateSecretCommand } from "@aws-sdk/client-secrets-manager";
import { Injectable } from "@nestjs/common";
import {
  buildAwsFiscalSecretRef,
  buildLocalFiscalSecretRef,
  putLocalFiscalSecret,
} from "./fiscal-device-local-secrets";

export type FiscalCredentialPayload = {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  signingKey?: string;
  tokenUrl?: string;
  oauthScope?: string;
  receiptSubmitPath?: string;
  posSerial?: string;
  posOsVersion?: string;
  posModelFramework?: string;
  presharedKey?: string;
  extra?: Record<string, unknown>;
};

@Injectable()
export class FiscalDeviceSecretsService {
  private async awsAvailable(): Promise<boolean> {
    if (process.env.KIORLY_FISCAL_SECRETS_LOCAL === "1") return false;
    if (process.env.NODE_ENV !== "production" && !process.env.AWS_REGION) return false;
    return true;
  }

  async storeDeviceCredentials(
    tenantId: string,
    providerKey: string,
    serial: string,
    payload: FiscalCredentialPayload,
  ): Promise<string> {
    const secretJson = JSON.stringify({
      clientId: payload.clientId.trim(),
      clientSecret: payload.clientSecret.trim(),
      baseUrl: payload.baseUrl?.trim(),
      signingKey: payload.signingKey?.trim(),
      tokenUrl: payload.tokenUrl?.trim(),
      oauthScope: payload.oauthScope?.trim(),
      receiptSubmitPath: payload.receiptSubmitPath?.trim(),
      posSerial: payload.posSerial?.trim() || serial,
      posOsVersion: payload.posOsVersion?.trim(),
      posModelFramework: payload.posModelFramework?.trim(),
      presharedKey: payload.presharedKey?.trim(),
      ...payload.extra,
    });

    const awsPath = buildAwsFiscalSecretRef(tenantId, providerKey, serial);
    if (!(await this.awsAvailable())) {
      const localRef = buildLocalFiscalSecretRef(tenantId, providerKey, serial);
      putLocalFiscalSecret(localRef, secretJson);
      return localRef;
    }

    const client = new SecretsManagerClient({});
    try {
      await client.send(
        new PutSecretValueCommand({
          SecretId: awsPath,
          SecretString: secretJson,
        }),
      );
    } catch {
      await client.send(
        new CreateSecretCommand({
          Name: awsPath,
          SecretString: secretJson,
        }),
      );
    }
    return awsPath;
  }
}