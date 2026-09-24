-- CreateTable
CREATE TABLE "AgentSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "voiceId" TEXT NOT NULL,
    "voiceName" TEXT,
    "voiceStability" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "voiceSimilarityBoost" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "voiceStyle" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voiceSpeakerBoost" BOOLEAN NOT NULL DEFAULT true,
    "openingLine" TEXT NOT NULL DEFAULT 'Hi this is HHL Credit, your payment is due today. Will payment be made today?',
    "voicemailMessage" TEXT NOT NULL DEFAULT 'Hi, this is an automated call from HHL Credit regarding a payment reminder. Please call us back at your convenience. Thank you.',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSettings_pkey" PRIMARY KEY ("id")
);
