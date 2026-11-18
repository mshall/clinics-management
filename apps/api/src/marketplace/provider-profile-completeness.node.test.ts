import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROVIDER_PROFILE_COMPLETENESS_MIN,
  providerProfileCompletenessPercent,
  type ProviderProfileJson,
} from "./provider-profile-schema";

const rich: ProviderProfileJson = {
  displayNameEn: "Dr Ahmed",
  displayNameAr: "د. أحمد",
  specialty: "GENERAL_MEDICINE",
  bioEn: "Board-certified physician with focus on primary care and chronic disease.",
  bioAr: "طبيب معتمد متخصص في الرعاية الأولية والأمراض المزمنة مع خبرة واسعة.",
  photoRelativePath: "t/u/photo.jpg",
  languages: ["ar", "en"],
  yearsExperience: 12,
  education: [{ degreeEn: "MD", institutionEn: "Cairo University" }],
  amenities: ["parking"],
  parking: true,
  wheelchairAccess: true,
};

describe("KX-02 provider profile completeness", () => {
  it("scores below minimum when profile is sparse", () => {
    const score = providerProfileCompletenessPercent({
      profile: { displayNameEn: "Dr" },
      hasMarketplaceFees: false,
      clinicHasGeo: false,
      clinicHasAddress: false,
    });
    assert.ok(score < PROVIDER_PROFILE_COMPLETENESS_MIN);
  });

  it("scores at or above minimum for a complete profile", () => {
    const score = providerProfileCompletenessPercent({
      profile: rich,
      hasMarketplaceFees: true,
      clinicHasGeo: true,
      clinicHasAddress: true,
    });
    assert.ok(score >= PROVIDER_PROFILE_COMPLETENESS_MIN);
  });

  it("minimum threshold is 80", () => {
    assert.equal(PROVIDER_PROFILE_COMPLETENESS_MIN, 80);
  });
});