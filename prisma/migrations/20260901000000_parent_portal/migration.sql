-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable: add isVisibleToParent flag to DisciplineRecord (Requirement 8.6)
ALTER TABLE "DisciplineRecord" ADD COLUMN "isVisibleToParent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add isVisibleToParent flag to Achievement (Requirement 8.7)
ALTER TABLE "Achievement" ADD COLUMN "isVisibleToParent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: Parent model (Requirements 1.1, 1.4)
CREATE TABLE "Parent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ParentStudent join table (Requirement 1.2)
CREATE TABLE "ParentStudent" (
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentStudent_pkey" PRIMARY KEY ("parentId","studentId")
);

-- CreateTable: ParentNotification model (Requirements 1.3, 1.5, 1.6)
CREATE TABLE "ParentNotification" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "dedupKey" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Parent.userId unique (Requirement 1.1)
CREATE UNIQUE INDEX "Parent_userId_key" ON "Parent"("userId");

-- CreateIndex: Parent school index (Requirement 1.1)
CREATE INDEX "Parent_schoolId_idx" ON "Parent"("schoolId");

-- CreateIndex: @@unique([schoolId, phone]) — one phone per school (Requirement 1.4)
CREATE UNIQUE INDEX "Parent_schoolId_phone_key" ON "Parent"("schoolId", "phone");

-- CreateIndex: ParentStudent studentId index
CREATE INDEX "ParentStudent_studentId_idx" ON "ParentStudent"("studentId");

-- CreateIndex: ParentStudent parentId index
CREATE INDEX "ParentStudent_parentId_idx" ON "ParentStudent"("parentId");

-- CreateIndex: @@index([parentId, isRead, createdAt]) — fast unread-count queries (Requirement 1.5)
CREATE INDEX "ParentNotification_parentId_isRead_createdAt_idx" ON "ParentNotification"("parentId", "isRead", "createdAt");

-- CreateIndex: @@unique([schoolId, dedupKey]) — deduplication (Requirement 1.6)
CREATE UNIQUE INDEX "ParentNotification_schoolId_dedupKey_key" ON "ParentNotification"("schoolId", "dedupKey");

-- AddForeignKey: Parent.userId → User.id (cascade delete)
ALTER TABLE "Parent" ADD CONSTRAINT "Parent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Parent.schoolId → School.id (cascade delete)
ALTER TABLE "Parent" ADD CONSTRAINT "Parent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ParentStudent.parentId → Parent.id (cascade delete)
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ParentStudent.studentId → Student.id (cascade delete)
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ParentNotification.parentId → Parent.id (cascade delete)
ALTER TABLE "ParentNotification" ADD CONSTRAINT "ParentNotification_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ParentNotification.schoolId → School.id (cascade delete)
ALTER TABLE "ParentNotification" ADD CONSTRAINT "ParentNotification_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
