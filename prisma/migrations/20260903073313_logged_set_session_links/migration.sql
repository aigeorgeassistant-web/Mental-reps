/*
  Warnings:

  - A unique constraint covering the columns `[sessionExerciseId,setIndex]` on the table `LoggedSet` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "LoggedSet" ADD COLUMN     "sessionExerciseId" TEXT,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "setIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "LoggedSet_sessionExerciseId_setIndex_key" ON "LoggedSet"("sessionExerciseId", "setIndex");

-- AddForeignKey
ALTER TABLE "LoggedSet" ADD CONSTRAINT "LoggedSet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoggedSet" ADD CONSTRAINT "LoggedSet_sessionExerciseId_fkey" FOREIGN KEY ("sessionExerciseId") REFERENCES "SessionExercise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
