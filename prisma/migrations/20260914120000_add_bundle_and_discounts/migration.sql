-- Add discount fields to Program
ALTER TABLE "Program"
  ADD COLUMN "discountFlat"    DECIMAL,
  ADD COLUMN "discountPercent" DECIMAL,
  ADD COLUMN "discountEndsAt"  TIMESTAMP(3);

-- CreateTable Bundle
CREATE TABLE "Bundle" (
    "id"              TEXT NOT NULL,
    "coachId"         TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "currency"        TEXT NOT NULL DEFAULT 'KWD',
    "discountFlat"    DECIMAL,
    "discountPercent" DECIMAL,
    "discountEndsAt"  TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable BundleItem
CREATE TABLE "BundleItem" (
    "id"         TEXT NOT NULL,
    "bundleId"   TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable BundlePurchase
CREATE TABLE "BundlePurchase" (
    "id"          TEXT NOT NULL,
    "bundleId"    TEXT NOT NULL,
    "clientId"    TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pricePaid"   DECIMAL NOT NULL,
    "currency"    TEXT NOT NULL,
    CONSTRAINT "BundlePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BundleItem_bundleId_templateId_key" ON "BundleItem"("bundleId", "templateId");

-- AddForeignKey Bundle → Coach
ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_coachId_fkey"
    FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey BundleItem → Bundle
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey"
    FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey BundleItem → Program
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey BundlePurchase → Bundle
ALTER TABLE "BundlePurchase" ADD CONSTRAINT "BundlePurchase_bundleId_fkey"
    FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey BundlePurchase → Client
ALTER TABLE "BundlePurchase" ADD CONSTRAINT "BundlePurchase_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
