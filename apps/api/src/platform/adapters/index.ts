/** KX-21 §01 application adapters — the only code allowed to import `@aws-sdk/*`. */
export * from "./secrets.adapter";
export * from "./email.adapter";
export { S3UploadBlobStorage } from "./object-storage.s3.adapter";
