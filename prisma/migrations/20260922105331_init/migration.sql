-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'VALIDATED', 'RUNNING', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CallbackTaskStatus" AS ENUM ('OPEN', 'COMPLETED');

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "callSchedulingConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumberRaw" TEXT NOT NULL,
    "phoneNumberE164" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,
    "outstandingAmount" DECIMAL(65,30),
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "validationErrors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "customerRecordId" TEXT NOT NULL,
    "twilioCallSid" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "wasAnswered" BOOLEAN,
    "outcome" TEXT,
    "identityConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "callSummary" TEXT,
    "transcript" JSONB,
    "promiseToPayRaw" TEXT,
    "promiseToPayNormalized" TIMESTAMP(3),
    "paymentInstructionsRequested" BOOLEAN NOT NULL DEFAULT false,
    "paymentInstructionsSent" BOOLEAN NOT NULL DEFAULT false,
    "callbackRequired" BOOLEAN NOT NULL DEFAULT false,
    "callbackReason" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallbackTask" (
    "id" TEXT NOT NULL,
    "customerRecordId" TEXT NOT NULL,
    "callId" TEXT,
    "reason" TEXT NOT NULL,
    "summary" TEXT,
    "customerStatement" TEXT,
    "status" "CallbackTaskStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallbackTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerRecord_batchId_idx" ON "CustomerRecord"("batchId");

-- CreateIndex
CREATE INDEX "CustomerRecord_phoneNumberE164_idx" ON "CustomerRecord"("phoneNumberE164");

-- CreateIndex
CREATE INDEX "Call_customerRecordId_idx" ON "Call"("customerRecordId");

-- CreateIndex
CREATE INDEX "Call_twilioCallSid_idx" ON "Call"("twilioCallSid");

-- CreateIndex
CREATE INDEX "CallbackTask_customerRecordId_idx" ON "CallbackTask"("customerRecordId");

-- CreateIndex
CREATE INDEX "CallbackTask_status_idx" ON "CallbackTask"("status");

-- AddForeignKey
ALTER TABLE "CustomerRecord" ADD CONSTRAINT "CustomerRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_customerRecordId_fkey" FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallbackTask" ADD CONSTRAINT "CallbackTask_customerRecordId_fkey" FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallbackTask" ADD CONSTRAINT "CallbackTask_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
