import { Readable } from "node:stream";
import { NotFoundException } from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { UploadBlobStorage } from "./upload-blob.storage";
import type { UploadKind } from "./upload-kind";

export class S3UploadBlobStorage implements UploadBlobStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    region: string,
  ) {
    this.client = new S3Client({ region });
  }

  private objectKey(kind: UploadKind, relativeKey: string): string {
    return `${kind}/${relativeKey}`;
  }

  async put(kind: UploadKind, relativeKey: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(kind, relativeKey),
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
    );
  }

  async assertExists(kind: UploadKind, relativeKey: string): Promise<void> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(kind, relativeKey),
        }),
      );
    } catch (e: unknown) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
      if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
        throw new NotFoundException("File not found in object storage");
      }
      throw e;
    }
  }

  async getReadStream(kind: UploadKind, relativeKey: string): Promise<Readable> {
    let out;
    try {
      out = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(kind, relativeKey),
        }),
      );
    } catch (e: unknown) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const name = e && typeof e === "object" && "name" in e ? String((e as { name?: string }).name) : "";
      if (status === 404 || name === "NoSuchKey") {
        throw new NotFoundException("File not found in object storage");
      }
      throw e;
    }
    if (!out.Body) {
      throw new NotFoundException("File not found in object storage");
    }
    const buf = Buffer.from(await out.Body.transformToByteArray());
    return Readable.from(buf);
  }

  async deleteObject(kind: UploadKind, relativeKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(kind, relativeKey),
        }),
      );
    } catch {
      /* ignore */
    }
  }
}
