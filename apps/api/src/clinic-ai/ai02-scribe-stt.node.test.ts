import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertPilotDraftLatency,
  draftNoteFromTranscript,
  transcribeScribeAudio,
} from "./scribe-stt.provider";

describe("AI-02 scribe STT", () => {
  it("produces a usable mixed Egyptian Arabic / English draft under the 60s pilot budget for 10 minutes of audio", async () => {
    const audioSeconds = 10 * 60;
    const wall = Date.now();
    const stt = await transcribeScribeAudio({ audioBytes: audioSeconds * 16_000, audioSeconds });
    const draft = draftNoteFromTranscript(stt.transcript);
    const latencyMs = Date.now() - wall + stt.processingMs;
    assert.ok(/بطن|pain|omeprazole|شكرا/i.test(stt.transcript));
    assert.ok(stt.languageHints.includes("ar-EG"));
    assert.ok(draft.subjective.length > 20);
    assert.ok(draft.medications.length >= 1);
    assert.equal(assertPilotDraftLatency(audioSeconds, latencyMs), true);
    assert.ok(latencyMs < 60_000);
  });

  it("pilot latency gate rejects a slow 10-minute job", () => {
    assert.equal(assertPilotDraftLatency(600, 61_000), false);
    assert.equal(assertPilotDraftLatency(600, 59_000), true);
  });
});
