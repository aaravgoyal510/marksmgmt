-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GradingPolicy" ADD COLUMN IF NOT EXISTS "attendanceShortfallPercent" INTEGER;
