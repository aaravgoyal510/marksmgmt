-- AlterTable
ALTER TABLE "SubjectOfferingSection" ADD COLUMN IF NOT EXISTS "marksPublishedAt" TIMESTAMP(3);
ALTER TABLE "SubjectOfferingSection" ADD COLUMN IF NOT EXISTS "marksPublishedById" TEXT;

