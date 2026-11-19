-- AI-02 ambient scribe audio + metering fields
ALTER TABLE "AiScribeSession" ADD COLUMN IF NOT EXISTS "consentGrantedAt" TIMESTAMP(3);
ALTER TABLE "AiScribeSession" ADD COLUMN IF NOT EXISTS "recordingStartedAt" TIMESTAMP(3);
ALTER TABLE "AiScribeSession" ADD COLUMN IF NOT EXISTS "recordingStoppedAt" TIMESTAMP(3);
ALTER TABLE "AiScribeSession" ADD COLUMN IF NOT EXISTS "audioSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiScribeSession" ADD COLUMN IF NOT EXISTS "retainAudioAfterSignOff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiScribeSession" ADD COLUMN IF NOT EXISTS "sttProvider" TEXT;
ALTER TABLE "AiScribeSession" ADD COLUMN IF NOT EXISTS "draftLatencyMs" INTEGER;

CREATE TABLE IF NOT EXISTS "AiScribeAudioChunk" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'audio/webm',
    "payloadB64" TEXT NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiScribeAudioChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiScribeAudioChunk_sessionId_seq_key" ON "AiScribeAudioChunk"("sessionId", "seq");
CREATE INDEX IF NOT EXISTS "AiScribeAudioChunk_sessionId_idx" ON "AiScribeAudioChunk"("sessionId");

ALTER TABLE "AiScribeAudioChunk" DROP CONSTRAINT IF EXISTS "AiScribeAudioChunk_sessionId_fkey";
ALTER TABLE "AiScribeAudioChunk" ADD CONSTRAINT "AiScribeAudioChunk_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiScribeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
