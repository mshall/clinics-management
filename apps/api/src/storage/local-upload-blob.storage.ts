import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Readable } from "node:stream";
import { NotFoundException } from "@nestjs/common";
import type { UploadBlobStorage } from "./upload-blob.storage";
import type { UploadKind } from "./upload-kind";

/** Files under `uploadRoot/<kind>/<relativeKey>`. */
export class LocalUploadBlobStorage implements UploadBlobStorage {
  constructor(private readonly uploadRoot: string) {}

  private abs(kind: UploadKind, relativeKey: string): string {
    return path.join(this.uploadRoot, kind, relativeKey);
  }

  async put(kind: UploadKind, relativeKey: string, body: Buffer, _contentType: string): Promise<void> {
    const target = this.abs(kind, relativeKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }

  async assertExists(kind: UploadKind, relativeKey: string): Promise<void> {
    try {
      await fs.access(this.abs(kind, relativeKey));
    } catch {
      throw new NotFoundException("File missing on disk");
    }
  }

  async getReadStream(kind: UploadKind, relativeKey: string): Promise<Readable> {
    await this.assertExists(kind, relativeKey);
    return createReadStream(this.abs(kind, relativeKey));
  }

  async deleteObject(kind: UploadKind, relativeKey: string): Promise<void> {
    try {
      await fs.unlink(this.abs(kind, relativeKey));
    } catch {
      /* ignore missing */
    }
  }
}
