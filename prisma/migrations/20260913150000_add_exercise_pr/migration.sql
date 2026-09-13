-- CreateTable
CREATE TABLE "ExercisePr" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "loggedSetId" TEXT,
    "bestWeight" DOUBLE PRECISION,
    "bestReps" INTEGER,
    "bestE1rm" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExercisePr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExercisePr_clientId_exerciseId_key" ON "ExercisePr"("clientId", "exerciseId");

-- AddForeignKey
ALTER TABLE "ExercisePr" ADD CONSTRAINT "ExercisePr_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExercisePr" ADD CONSTRAINT "ExercisePr_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
