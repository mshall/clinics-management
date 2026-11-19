import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unzipSync, zipSync } from "fflate";

describe("org backup package layout", () => {
  it("full backup zip contains SQL, manifest and nested files paths", () => {
    const sql = 'INSERT INTO "Patient" ("id","tenantId") VALUES (\'p1\',\'t1\');';
    const manifest = {
      tenantId: "t1",
      exportedAt: new Date().toISOString(),
      selectedEntities: ["patients"],
      files: [
        {
          zipPath: "files/patients/p1/national-id/id.pdf",
          originalFileName: "id.pdf",
          mimeType: "application/pdf",
          entityType: "patient_national_id",
          entityId: "p1",
          storageKind: "patients",
          relativePath: "t1/p1/id.pdf",
        },
      ],
      skipped: [],
    };
    const zipped = zipSync({
      "organization-export.sql": Buffer.from(sql),
      "manifest.json": Buffer.from(JSON.stringify(manifest)),
      "files/patients/p1/national-id/id.pdf": Buffer.from("%PDF-1.4"),
      "README.txt": Buffer.from("backup"),
    });
    const out = unzipSync(zipped);
    assert.ok(out["organization-export.sql"]);
    assert.ok(out["manifest.json"]);
    assert.ok(out["files/patients/p1/national-id/id.pdf"]);
    const parsed = JSON.parse(Buffer.from(out["manifest.json"]!).toString("utf8"));
    assert.equal(parsed.tenantId, "t1");
    assert.equal(parsed.files[0].storageKind, "patients");
  });
});
