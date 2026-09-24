-- AlterTable
ALTER TABLE "AgentSettings" ADD COLUMN     "additionalContext" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "voiceSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
