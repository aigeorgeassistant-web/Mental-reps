-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "favourite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE';
