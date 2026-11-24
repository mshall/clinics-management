import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isClientCurrentWithManifest, shouldPromptForNewBuild } from "./deploy-version-logic";

describe("deploy-version-logic", () => {
  it("does not prompt when remote matches the client", () => {
    assert.equal(
      shouldPromptForNewBuild({
        clientBuildId: "abc",
        remoteBuildId: "abc",
        spaManifestBuildId: "abc",
      }),
      false,
    );
  });

  it("prompts when the SPA manifest is ahead of the client (new deploy to fetch)", () => {
    assert.equal(
      shouldPromptForNewBuild({
        clientBuildId: "old",
        remoteBuildId: "new",
        spaManifestBuildId: "new",
      }),
      true,
    );
  });

  it("does not prompt when the client already matches the SPA but the API header is stale", () => {
    // Web-only deploy: SPA + build-id.json = new; App Runner WEB_BUILD_ID still old.
    assert.equal(
      shouldPromptForNewBuild({
        clientBuildId: "new",
        remoteBuildId: "old",
        spaManifestBuildId: "new",
      }),
      false,
    );
  });

  it("prompts from API header alone when the SPA manifest is unknown", () => {
    assert.equal(
      shouldPromptForNewBuild({
        clientBuildId: "old",
        remoteBuildId: "new",
        spaManifestBuildId: null,
      }),
      true,
    );
  });

  it("detects client current with manifest", () => {
    assert.equal(isClientCurrentWithManifest("sha1", "sha1"), true);
    assert.equal(isClientCurrentWithManifest("sha1", "sha2"), false);
    assert.equal(isClientCurrentWithManifest("sha1", null), false);
  });
});
