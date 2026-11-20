import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTravelMatrix, isInCoverage, normalizeDistrictId, parseDistrictList } from "./zones";

describe("zones (HVCFG02 / HVBK01)", () => {
  const matrix = buildTravelMatrix({ "nasr-city": { maadi: 40, heliopolis: 15 } });
  const zone = { districtIds: ["nasr-city", "heliopolis", "maadi"], maxTravelMinutes: 30, startDistrictId: "nasr-city" };

  it("normalises district ids", () => {
    assert.equal(normalizeDistrictId(" Nasr  City "), "nasr-city");
    assert.equal(normalizeDistrictId("مدينة نصر"), "مدينة-نصر");
    assert.equal(normalizeDistrictId("Heliopolis!"), "heliopolis");
  });

  it("in-zone requires a covered district", () => {
    assert.deepEqual(isInCoverage({ districtIds: ["maadi"] }, { districtId: "Maadi" }), { inZone: true });
    assert.deepEqual(isInCoverage({ districtIds: ["maadi"] }, { districtId: "zamalek" }), { inZone: false, reason: "DISTRICT_NOT_COVERED" });
    assert.deepEqual(isInCoverage({ districtIds: ["maadi"] }, null), { inZone: false, reason: "NO_DISTRICT" });
    assert.deepEqual(isInCoverage({ districtIds: ["maadi"] }, { districtId: "" }), { inZone: false, reason: "NO_DISTRICT" });
  });

  it("optional maximum travel time from the start point", () => {
    assert.deepEqual(isInCoverage(zone, { districtId: "heliopolis" }, matrix), { inZone: true });
    assert.deepEqual(isInCoverage(zone, { districtId: "maadi" }, matrix), { inZone: false, reason: "TRAVEL_TOO_LONG" });
    assert.deepEqual(isInCoverage({ ...zone, districtIds: ["nasr-city", "dokki"] }, { districtId: "dokki" }, matrix), { inZone: false, reason: "TRAVEL_UNKNOWN" });
    assert.deepEqual(isInCoverage(zone, { districtId: "nasr-city" }, matrix), { inZone: true }, "start district = 0 min");
  });

  it("matrix is symmetric with an optional fallback", () => {
    assert.equal(matrix.minutes("maadi", "nasr-city"), 40);
    assert.equal(matrix.minutes("a", "b"), null);
    assert.equal(buildTravelMatrix({}, 60).minutes("a", "b"), 60);
  });

  it("district lists from a market pack are validated (AR + EN names, unique normalised ids)", () => {
    assert.equal(parseDistrictList([{ id: "maadi", nameEn: "Maadi", nameAr: "المعادي" }]).length, 1);
    assert.throws(() => parseDistrictList([{ id: "Maadi", nameEn: "Maadi", nameAr: "" }]), /normalised slug.*nameAr|nameAr/);
    assert.throws(() => parseDistrictList([{ id: "a", nameEn: "A", nameAr: "ا" }, { id: "a", nameEn: "A", nameAr: "ا" }]), /duplicate/);
    assert.throws(() => parseDistrictList("x"), /array/);
  });
});
