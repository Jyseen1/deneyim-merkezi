-- AlterEnum
ALTER TYPE "ReservationStatus" ADD VALUE 'NO_SHOW';

-- CreateTable
CREATE TABLE "recurring_blocks" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_blocks_pkey" PRIMARY KEY ("id")
);
