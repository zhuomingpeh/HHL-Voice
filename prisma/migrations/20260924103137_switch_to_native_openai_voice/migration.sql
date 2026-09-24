-- AlterTable
ALTER TABLE "AgentSettings" ADD COLUMN     "openaiVoice" TEXT NOT NULL DEFAULT 'marin',
ALTER COLUMN "voiceId" SET DEFAULT '';
