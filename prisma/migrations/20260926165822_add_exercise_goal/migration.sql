-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('STRENGTH', 'ENDURANCE');

-- AlterTable
ALTER TABLE "SessionExercise" ADD COLUMN     "goalId" TEXT,
ADD COLUMN     "goalOccurrence" INTEGER;

-- CreateTable
CREATE TABLE "ExerciseGoal" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "dayLabels" TEXT[],
    "type" "GoalType" NOT NULL DEFAULT 'STRENGTH',
    "blocks" JSONB NOT NULL,
    "baselineAnchor" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseGoal_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SessionExercise" ADD CONSTRAINT "SessionExercise_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ExerciseGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseGoal" ADD CONSTRAINT "ExerciseGoal_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseGoal" ADD CONSTRAINT "ExerciseGoal_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
