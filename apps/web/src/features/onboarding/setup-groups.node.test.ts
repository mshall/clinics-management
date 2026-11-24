import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OnboardingStepDto, OnboardingStepKey } from "../../lib/onboarding-api";
import { defaultGroupIndex, groupSetupSteps, orderedSetupSteps, setupGroupForStep } from "./setup-groups";

function step(key: OnboardingStepKey, over: Partial<OnboardingStepDto> = {}): OnboardingStepDto {
  return {
    key,
    order: 0,
    required: true,
    manual: false,
    scope: "org",
    status: "pending",
    completedAt: null,
    href: "/",
    whoCan: [],
    canPerform: true,
    available: true,
    entities: null,
    doneCount: 0,
    totalCount: 1,
    ...over,
  };
}

describe("setup groups", () => {
  it("keeps required journey phases before the optional phase", () => {
    assert.equal(setupGroupForStep("clinic_profile"), "clinic");
    assert.equal(setupGroupForStep("doctor_availability"), "team");
    assert.equal(setupGroupForStep("first_appointment"), "golive");
    assert.equal(setupGroupForStep("clinic_logo"), "optional");
    assert.equal(setupGroupForStep("connect_kiorex"), "optional");
    assert.equal(setupGroupForStep("nurse_zones"), "nurse");
  });

  it("places optional steps last and omits empty phases", () => {
    const buckets = groupSetupSteps(
      [
        step("clinic_profile"),
        step("clinic_logo", { required: false }),
        step("first_appointment"),
        step("connect_kiorex", { required: false }),
      ],
      "first_appointment",
    );
    assert.deepEqual(
      buckets.map((b) => b.id),
      ["clinic", "golive", "optional"],
    );
    assert.equal(buckets.at(-1)?.optional, true);
    assert.equal(buckets.find((b) => b.id === "golive")?.hasNext, true);
  });

  it("orders wizard steps with optional keys after go-live", () => {
    const ordered = orderedSetupSteps([
      step("connect_kiorex", { required: false }),
      step("clinic_profile"),
      step("first_appointment"),
      step("clinic_logo", { required: false }),
    ]).map((s) => s.key);
    assert.deepEqual(ordered, ["clinic_profile", "first_appointment", "clinic_logo", "connect_kiorex"]);
  });

  it("defaults the visible phase to the one with the next action", () => {
    const buckets = groupSetupSteps(
      [step("clinic_profile", { status: "done" }), step("first_appointment"), step("clinic_logo", { required: false })],
      "first_appointment",
    );
    assert.equal(buckets[defaultGroupIndex(buckets)]?.id, "golive");
  });
});
