/*
  Warnings:

  - You are about to alter the column `discountFlat` on the `Bundle` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `discountPercent` on the `Bundle` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `pricePaid` on the `BundlePurchase` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `discountFlat` on the `Program` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.
  - You are about to alter the column `discountPercent` on the `Program` table. The data in that column could be lost. The data in that column will be cast from `Decimal` to `Decimal(65,30)`.

*/
-- AlterTable
ALTER TABLE "Bundle" ALTER COLUMN "discountFlat" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "discountPercent" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "BundlePurchase" ALTER COLUMN "pricePaid" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Program" ALTER COLUMN "discountFlat" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "discountPercent" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "TemplatePurchase" ADD COLUMN     "grantedBy" TEXT;
