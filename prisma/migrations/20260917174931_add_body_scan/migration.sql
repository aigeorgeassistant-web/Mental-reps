-- CreateTable
CREATE TABLE "BodyScan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight" DOUBLE PRECISION,
    "muscleMass" DOUBLE PRECISION,
    "fatPercent" DOUBLE PRECISION,
    "visceralFat" DOUBLE PRECISION,
    "bmr" DOUBLE PRECISION,
    "phaseAngle" DOUBLE PRECISION,
    "rawText" TEXT,
    "imageUrl" TEXT,

    CONSTRAINT "BodyScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BodyScan_clientId_idx" ON "BodyScan"("clientId");

-- AddForeignKey
ALTER TABLE "BodyScan" ADD CONSTRAINT "BodyScan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
