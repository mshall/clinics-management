import type { Readable } from "node:stream";
import type { UploadKind } from "./upload-kind";

export const UPLOAD_BLOB_STORAGE = Symbol("UPLOAD_BLOB_STORAGE");

/**
 * Binary uploads: local `uploads/<kind>/` in dev, private S3 in production.
 * `relativeKey` is the value stored in the DB (tenant-scoped path, no leading slash).
 */
export interface UploadBlobStorage {
  put(kind: UploadKind, relativeKey: string, body: Buffer, contentType: string): Promise<void>;
  assertExists(kind: UploadKind, relativeKey: string): Promise<void>;
  getReadStream(kind: UploadKind, relativeKey: string): Promise<Readable>;
  deleteObject(kind: UploadKind, relativeKey: string): Promise<void>;
}
