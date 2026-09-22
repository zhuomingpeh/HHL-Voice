-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "callSchedulingConfig" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomerRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumberRaw" TEXT NOT NULL,
    "phoneNumberE164" TEXT,
    "dueDate" DATETIME NOT NULL,
    "remarks" TEXT,
    "outstandingAmount" DECIMAL,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "validationErrors" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomerRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerRecordId" TEXT NOT NULL,
    "twilioCallSid" TEXT,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "durationSeconds" INTEGER,
    "wasAnswered" BOOLEAN,
    "outcome" TEXT,
    "identityConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "callSummary" TEXT,
    "transcript" JSONB,
    "promiseToPayRaw" TEXT,
    "promiseToPayNormalized" DATETIME,
    "paymentInstructionsRequested" BOOLEAN NOT NULL DEFAULT false,
    "paymentInstructionsSent" BOOLEAN NOT NULL DEFAULT false,
    "callbackRequired" BOOLEAN NOT NULL DEFAULT false,
    "callbackReason" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Call_customerRecordId_fkey" FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallbackTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerRecordId" TEXT NOT NULL,
    "callId" TEXT,
    "reason" TEXT NOT NULL,
    "summary" TEXT,
    "customerStatement" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "completedAt" DATETIME,
    "completedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CallbackTask_customerRecordId_fkey" FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallbackTask_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
