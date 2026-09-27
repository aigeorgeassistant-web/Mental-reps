-- CreateEnum
CREATE TYPE "ExerciseMetric" AS ENUM ('REPS', 'DISTANCE', 'CALORIES');

-- AlterTable
ALTER TABLE "ExerciseGoal" ADD COLUMN     "constantWeight" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SessionExercise" ADD COLUMN     "metric" "ExerciseMetric" NOT NULL DEFAULT 'REPS';

-- CreateTable
CREATE TABLE "CoachExercisePreference" (
    "coachId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "metric" "ExerciseMetric" NOT NULL DEFAULT 'REPS'
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachExercisePreference_coachId_exerciseId_key" ON "CoachExercisePreference"("coachId", "exerciseId");

-- AddForeignKey
ALTER TABLE "CoachExercisePreference" ADD CONSTRAINT "CoachExercisePreference_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachExercisePreference" ADD CONSTRAINT "CoachExercisePreference_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
