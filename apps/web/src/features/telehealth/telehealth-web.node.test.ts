import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeQuality } from "./webrtc/quality";
import { shareMessage, smsShareUrl, whatsappShareUrl } from "./share-link";
import { detectPlatform } from "./platform";

describe("telehealth web helpers", () => {
  it("quality buckets from two getStats samples", () => {
    const a = { packetsReceived: 100, packetsLost: 0, rttMs: 40, jitterMs: 5 };
    assert.equal(computeQuality(null, a), "unknown");
    assert.equal(computeQuality(a, { packetsReceived: 400, packetsLost: 2, rttMs: 60, jitterMs: 8 }), "good");
    assert.equal(computeQuality(a, { packetsReceived: 400, packetsLost: 20, rttMs: 60, jitterMs: 8 }), "fair");
    assert.equal(computeQuality(a, { packetsReceived: 400, packetsLost: 100, rttMs: 60, jitterMs: 8 }), "poor");
    assert.equal(computeQuality(a, { packetsReceived: 400, packetsLost: 0, rttMs: 700, jitterMs: 8 }), "poor");
    assert.equal(computeQuality(a, a), "poor", "nothing flowing");
  });

  it("share links are prefilled and encoded (WhatsApp digits-only, SMS keeps +)", () => {
    const msg = shareMessage({ name: "Sara", clinic: "Kiorly", when: "Mon 10:00", link: "https://k.example/v/abc.def", lang: "en" });
    assert.match(whatsappShareUrl("+20 100 123 4567", msg), /^https:\/\/wa\.me\/201001234567\?text=Hello%20Sara/);
    assert.match(smsShareUrl("+201001234567", msg), /^sms:\+201001234567\?&body=Hello%20Sara/);
    assert.ok(shareMessage({ name: "سارة", clinic: "عيادة", when: "x", link: "l", lang: "ar" }).includes("رابط زيارتك"));
  });

  it("permission-help platform detection", () => {
    assert.equal(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari"), "ios-safari");
    assert.equal(detectPlatform("Mozilla/5.0 (Linux; Android 14) Chrome/120"), "android-chrome");
    assert.equal(detectPlatform("Mozilla/5.0 (Macintosh) Chrome/120"), "other");
    assert.equal(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"), "ios-app");
    assert.equal(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"), "android-app");
  });
});
