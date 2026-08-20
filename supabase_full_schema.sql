-- BIDII SCHOOL MANAGEMENT SYSTEM - FULL DATABASE SETUP
-- Generated: 2026-08-16 09:13:42
-- Supabase SQL Editor: paste and run
-- Super Admin: bidiisoftwares.1.ke@gmail.com / Bidii@2026
-- 98 tables, 273 indexes, 48 enums, 4 check constraints

SET client_min_messages TO WARNING;

-- SECTION 1: FULL SCHEMA
-- CreateEnum
CREATE TYPE "TimetableSlotType" AS ENUM ('LESSON', 'BREAK', 'LUNCH', 'GAMES', 'ASSEMBLY');

-- CreateEnum
CREATE TYPE "TimetableSession" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "TimetableVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TimetableChangeAction" AS ENUM ('GENERATED', 'PUBLISHED', 'ARCHIVED', 'SLOT_EDITED', 'SLOT_LOCKED', 'SLOT_UNLOCKED', 'CLONED', 'DELETED');

-- CreateEnum
CREATE TYPE "LibraryPatronType" AS ENUM ('DEFAULT', 'STUDENT', 'TEACHER', 'BOARDING', 'DAY_SCHOLAR', 'JUNIOR', 'SENIOR');

-- CreateEnum
CREATE TYPE "LibraryReservationType" AS ENUM ('INDIVIDUAL', 'CLASSROOM', 'DEPARTMENT', 'WAITLIST');

-- CreateEnum
CREATE TYPE "LibraryReservationStatus" AS ENUM ('PENDING', 'ACTIVE', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LibraryIdentMethod" AS ENUM ('MANUAL', 'QR_CAMERA', 'QR_HARDWARE');

-- CreateEnum
CREATE TYPE "LibraryCardStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ALUMNI', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "LibraryCategory" AS ENUM ('TEXTBOOK', 'REFERENCE', 'FICTION', 'NON_FICTION', 'PERIODICAL', 'DICTIONARY', 'ATLAS', 'NOVEL', 'SCIENCE', 'MATHEMATICS', 'HUMANITIES', 'LANGUAGES', 'OTHER');

-- CreateEnum
CREATE TYPE "LibraryCopyCondition" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'LOST');

-- CreateEnum
CREATE TYPE "LibraryCopyStatus" AS ENUM ('AVAILABLE', 'BORROWED', 'RESERVED', 'UNDER_REPAIR', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DisciplineStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "AchievementCategory" AS ENUM ('SPORTS', 'LEADERSHIP', 'MUSIC_FESTIVAL', 'ACADEMICS', 'INNOVATION', 'OTHER');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PRINCIPAL', 'TEACHER', 'STUDENT', 'PARENT', 'WATCHMAN', 'MARKER', 'ADMIN_STAFF', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'STARTER', 'GROWTH', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SchoolStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SystemModule" AS ENUM ('ATTENDANCE', 'GRADING', 'FEE_MANAGEMENT', 'LIBRARY', 'TRANSPORT', 'MESSAGING', 'IMPORT_TOOL', 'REPORTS', 'TIMETABLE', 'ACCOMMODATION', 'ANALYTICS', 'AI_TOOLS');

-- CreateEnum
CREATE TYPE "ErrorSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ErrorStatus" AS ENUM ('NEW', 'INVESTIGATING', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('STUDENTS', 'STAFF', 'BOTH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('OPERATIONAL', 'DEGRADED', 'OUTAGE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "SystemHealthStatus" AS ENUM ('OPERATIONAL', 'DEGRADED', 'OUTAGE');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('CORE', 'ELECTIVE');

-- CreateEnum
CREATE TYPE "Module" AS ENUM ('DEPARTMENTS', 'SUBJECTS', 'STAFF', 'STAFF_ROLES', 'CLASSES', 'STUDENTS', 'TIMETABLE', 'EXAM_PERIODS', 'RESULTS', 'TOD', 'COMMUNICATION', 'CALENDAR', 'AI_TOOLS', 'REPORTS', 'RECORDS', 'RECORDS_DISCIPLINE', 'RECORDS_ACHIEVEMENTS', 'ANALYTICS', 'ASSESSMENTS', 'ASSESSMENT_FRAMEWORK', 'LIBRARY', 'HISTORY', 'ACCOMMODATION', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GEMINI', 'GOOGLE_CALENDAR', 'SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('HOLIDAY', 'EXAM', 'MEETING', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CalendarAudience" AS ENUM ('EVERYONE', 'STAFF_ONLY', 'PARENTS_ONLY');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "FrameworkType" AS ENUM ('EIGHT_FOUR_FOUR', 'CBC', 'CBE');

-- CreateEnum
CREATE TYPE "AssessmentResultKind" AS ENUM ('NUMERIC', 'PERFORMANCE_LEVEL', 'COMPETENCY_STATUS');

-- CreateEnum
CREATE TYPE "PerformanceLevel" AS ENUM ('EE', 'ME', 'AE', 'BE');

-- CreateEnum
CREATE TYPE "CompetencyStatus" AS ENUM ('COMPETENT', 'NOT_YET_COMPETENT');

-- CreateEnum
CREATE TYPE "AssessmentRoleType" AS ENUM ('SUBJECT_TEACHER', 'CLASS_TEACHER', 'HOD', 'EXAM_OFFICER', 'DIRECTOR', 'PARENT_VIEWER');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BoardingType" AS ENUM ('DAY_ONLY', 'BOARDING_ONLY', 'DAY_AND_BOARDING');

-- CreateEnum
CREATE TYPE "GenderPolicy" AS ENUM ('BOYS_ONLY', 'GIRLS_ONLY', 'MIXED');

-- CreateEnum
CREATE TYPE "DormStructure" AS ENUM ('OPEN_HALL', 'CUBICLE_BASED');

-- CreateEnum
CREATE TYPE "AllocationPolicy" AS ENUM ('RESTRICTED_BY_FORM', 'MIXED_FORMS');

-- CreateEnum
CREATE TYPE "BedType" AS ENUM ('SINGLE', 'DOUBLE_DECKER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BedPosition" AS ENUM ('UPPER', 'LOWER');

-- CreateEnum
CREATE TYPE "DormStatus" AS ENUM ('ACTIVE', 'UNDER_MAINTENANCE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('CURRENT', 'VACATED', 'TRANSFERRED', 'MAINTENANCE_HOLD');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionRating" AS ENUM ('EXCELLENT', 'GOOD', 'SATISFACTORY', 'NEEDS_IMPROVEMENT', 'POOR');

-- CreateEnum
CREATE TYPE "AccomEventType" AS ENUM ('ALLOCATED', 'TRANSFERRED', 'VACATED', 'REMOVED', 'MAINTENANCE_CLOSED', 'MAINTENANCE_REOPENED', 'EMERGENCY_RELOCATION', 'RESERVED', 'RESERVATION_RELEASED', 'RENOVATION_STARTED', 'RENOVATION_COMPLETED', 'REASSIGNED', 'STATUS_CHANGED');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "stampUrl" TEXT,
    "motto" TEXT,
    "boardingType" TEXT NOT NULL DEFAULT 'DAY_AND_BOARDING',
    "genderPolicy" TEXT NOT NULL DEFAULT 'MIXED',
    "autoAllocateDorms" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT,
    "staffRoleId" TEXT,
    "avatarUrl" TEXT,
    "avatarStoragePath" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "internalCode" INTEGER NOT NULL,
    "type" "SubjectType" NOT NULL DEFAULT 'CORE',
    "departmentId" TEXT NOT NULL,
    "applicableForms" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,
    "doubleLesson" BOOLEAN NOT NULL DEFAULT false,
    "requiresSpecialRoom" TEXT,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "staffId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "primaryDepartmentId" TEXT,
    "todEligible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archiveType" TEXT,
    "archiveReason" TEXT,
    "archivedById" TEXT,
    "employmentStartDate" TIMESTAMP(3),
    "designationSnapshot" TEXT,
    "departmentSnapshot" TEXT,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecycledStaffId" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecycledStaffId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRole" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "staffRoleId" TEXT NOT NULL,
    "module" "Module" NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canApprove" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT false,
    "canPrint" BOOLEAN NOT NULL DEFAULT false,
    "canManage" BOOLEAN NOT NULL DEFAULT false,
    "canConfigure" BOOLEAN NOT NULL DEFAULT false,
    "canAIAccess" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("staffRoleId","module")
);

-- CreateTable
CREATE TABLE "UserStaffRole" (
    "userId" TEXT NOT NULL,
    "staffRoleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "UserStaffRole_pkey" PRIMARY KEY ("userId","staffRoleId")
);

-- CreateTable
CREATE TABLE "PermissionAuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "targetUserId" TEXT,
    "staffRoleId" TEXT,
    "module" "Module",
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolIntegration" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "keyPreview" TEXT NOT NULL,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherSubject" (
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherSubject_pkey" PRIMARY KEY ("teacherId","subjectId")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "form" INTEGER NOT NULL,
    "stream" TEXT,
    "classTeacherId" TEXT,
    "frameworkType" "FrameworkType" NOT NULL DEFAULT 'EIGHT_FOUR_FOUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "admissionNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "boardingStatus" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "classId" TEXT NOT NULL,
    "parentName" TEXT,
    "parentContact" TEXT,
    "photoUrl" TEXT,
    "photoStoragePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archiveType" TEXT,
    "archiveReason" TEXT,
    "archivedById" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentElective" (
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentElective_pkey" PRIMARY KEY ("studentId","subjectId")
);

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableConfig" (
    "schoolId" TEXT NOT NULL,
    "academicYear" TEXT,
    "term" INTEGER,
    "operatingDays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4]::INTEGER[],
    "maxLessonsPerTeacherPerDay" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableConfig_pkey" PRIMARY KEY ("schoolId")
);

-- CreateTable
CREATE TABLE "TimetableTemplateColumn" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotType" "TimetableSlotType" NOT NULL DEFAULT 'LESSON',
    "label" TEXT,
    "session" "TimetableSession" NOT NULL DEFAULT 'MORNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableTemplateColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectLessonRequirement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "lessonsPerWeek" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectLessonRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSubjectProfile" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "type" "SubjectType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSubjectProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetablePreference" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "subjectCode" TEXT,
    "preferredSession" "TimetableSession",
    "isHard" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetablePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableVersion" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TimetableVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "academicYear" TEXT,
    "term" INTEGER,
    "clonedFromId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vulnerabilities" JSONB,

    CONSTRAINT "TimetableVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableVersionSlot" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "room" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockScope" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "lockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableVersionSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableChangeLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "versionId" TEXT,
    "action" "TimetableChangeAction" NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "performedById" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeSource" TEXT,
    "slotId" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "reason" TEXT,

    CONSTRAINT "TimetableChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSubjectTeacher" (
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSubjectTeacher_pkey" PRIMARY KEY ("classId","subjectId")
);

-- CreateTable
CREATE TABLE "TeacherUnavailability" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,

    CONSTRAINT "TeacherUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectiveGroup" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopeForm" INTEGER NOT NULL DEFAULT 0,
    "scopeStreams" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lessonsPerWeek" INTEGER NOT NULL DEFAULT 1,
    "doublesPerWeek" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectiveGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectiveGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectiveGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectiveGroupTeacher" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectiveGroupTeacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassElectiveGroupTeacher" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassElectiveGroupTeacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "EventType" NOT NULL DEFAULT 'EVENT',
    "audience" "CalendarAudience" NOT NULL DEFAULT 'EVERYONE',
    "openingDate" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplineRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT,
    "offence" TEXT NOT NULL,
    "description" TEXT,
    "actionTaken" TEXT,
    "resolution" TEXT,
    "dateOfOffence" TIMESTAMP(3) NOT NULL,
    "status" "DisciplineStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "aiSummary" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplineRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplineNote" (
    "id" TEXT NOT NULL,
    "disciplineRecordId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisciplineNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplineEvent" (
    "id" TEXT NOT NULL,
    "disciplineRecordId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisciplineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentFile" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "disciplineRecordId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "AchievementCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "achievementDate" TIMESTAMP(3) NOT NULL,
    "awardLevel" TEXT,
    "aiSummary" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementStudent" (
    "achievementId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementStudent_pkey" PRIMARY KEY ("achievementId","studentId")
);

-- CreateTable
CREATE TABLE "LibrarySettings" (
    "schoolId" TEXT NOT NULL,
    "maxBooksPerStudent" INTEGER NOT NULL DEFAULT 3,
    "maxBorrowDays" INTEGER NOT NULL DEFAULT 14,
    "finePerDay" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "maxRenewals" INTEGER NOT NULL DEFAULT 1,
    "identificationMethod" "LibraryIdentMethod" NOT NULL DEFAULT 'MANUAL',
    "barcodeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "eligibleFromForm" INTEGER,
    "cardValidityDays" INTEGER,
    "overdueAlertDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibrarySettings_pkey" PRIMARY KEY ("schoolId")
);

-- CreateTable
CREATE TABLE "LibraryCatalogue" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bookNumber" TEXT,
    "subject" TEXT,
    "form" INTEGER,
    "author" TEXT,
    "publisher" TEXT,
    "edition" TEXT,
    "isbn" TEXT,
    "category" "LibraryCategory" NOT NULL DEFAULT 'TEXTBOOK',
    "shelf" TEXT,
    "shelfRow" TEXT,
    "language" TEXT NOT NULL DEFAULT 'English',
    "publishYear" INTEGER,
    "purchaseDate" TIMESTAMP(3),
    "costPerCopy" DOUBLE PRECISION,
    "totalCopies" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryCatalogue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryCopy" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "catalogueId" TEXT NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "qrCode" TEXT,
    "barcode" TEXT,
    "condition" "LibraryCopyCondition" NOT NULL DEFAULT 'GOOD',
    "status" "LibraryCopyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "acquisitionDate" TIMESTAMP(3),
    "cost" DOUBLE PRECISION,
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryBook" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "publisher" TEXT,
    "publishYear" INTEGER,
    "totalCopies" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryCard" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "cardNumber" TEXT,
    "status" "LibraryCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspensionReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "fineBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFinesPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBorrowCount" INTEGER NOT NULL DEFAULT 0,
    "totalBorrowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryBorrow" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "bookId" TEXT,
    "copyId" TEXT,
    "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "fineStoppedAt" TIMESTAMP(3),
    "fineAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "returnCondition" TEXT,
    "returnType" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overrideById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryBorrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryPolicy" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "patronType" "LibraryPatronType" NOT NULL DEFAULT 'DEFAULT',
    "label" TEXT,
    "maxBooksAllowed" INTEGER NOT NULL DEFAULT 3,
    "borrowDays" INTEGER NOT NULL DEFAULT 14,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    "finePerDay" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "countWeekends" BOOLEAN NOT NULL DEFAULT true,
    "countHolidays" BOOLEAN NOT NULL DEFAULT false,
    "maxRenewals" INTEGER NOT NULL DEFAULT 1,
    "fineBlockThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lostBookMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "lostBookFixedFee" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "damagedBookFineRate" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "reservationsAllowed" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryFineAudit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "borrowId" TEXT,
    "eventType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryFineAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryFinePause" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SCHOOL_WIDE',
    "studentId" TEXT,
    "label" TEXT NOT NULL,
    "reason" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryFinePause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryReservation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "catalogueId" TEXT NOT NULL,
    "reservationType" "LibraryReservationType" NOT NULL DEFAULT 'INDIVIDUAL',
    "studentId" TEXT,
    "teacherId" TEXT,
    "departmentName" TEXT,
    "expectedReturnDate" TIMESTAMP(3),
    "quantityRequested" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "status" "LibraryReservationStatus" NOT NULL DEFAULT 'PENDING',
    "allocatedCopyId" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "queuePosition" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryClassroomLoan" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "catalogueId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT,
    "copiesCount" INTEGER NOT NULL DEFAULT 1,
    "borrowedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnDate" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryClassroomLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryCirculationEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "copyId" TEXT,
    "catalogueId" TEXT,
    "borrowId" TEXT,
    "reservationId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "performedById" TEXT,
    "studentId" TEXT,
    "teacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryCirculationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredImage" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "ownerId" TEXT,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "sizeBytes" INTEGER,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredReport" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "storagePath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "periodLabel" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolMeta" (
    "schoolId" TEXT NOT NULL,
    "planTier" "PlanTier" NOT NULL DEFAULT 'FREE',
    "status" "SchoolStatus" NOT NULL DEFAULT 'ONBOARDING',
    "storageQuotaGb" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "slug" TEXT,
    "contactPerson" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "studentCount" INTEGER NOT NULL DEFAULT 0,
    "staffCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolMeta_pkey" PRIMARY KEY ("schoolId")
);

-- CreateTable
CREATE TABLE "SchoolModuleToggle" (
    "schoolId" TEXT NOT NULL,
    "module" "SystemModule" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolModuleToggle_pkey" PRIMARY KEY ("schoolId","module")
);

-- CreateTable
CREATE TABLE "SystemError" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "message" TEXT NOT NULL,
    "stackTrace" TEXT,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'MEDIUM',
    "module" TEXT,
    "status" "ErrorStatus" NOT NULL DEFAULT 'NEW',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "context" JSONB,
    "notes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceHealth" (
    "id" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "uptimePct24h" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "uptimePct7d" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "uptimePct30d" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "lastIncidentAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "responseTimeMs" DOUBLE PRECISION,
    "errorRate" DOUBLE PRECISION,
    "requestCount" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentLog" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "serviceName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageUsage" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "errorReport" JSONB,
    "createdBy" TEXT,
    "rollbackAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemStatus" (
    "id" TEXT NOT NULL,
    "status" "SystemHealthStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "message" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathwayWeight" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sbaWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "examWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "sbaMaxMarks" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "examMaxMarks" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PathwayWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubjectExpectation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "form" INTEGER NOT NULL,
    "expectedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormSubjectExpectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentFramework" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "FrameworkType" NOT NULL,
    "label" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentFramework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentPeriod" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxMarks" DOUBLE PRECISION,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "openingDate" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paper" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "maxMarks" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentFormulaConfig" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "form" INTEGER NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentFormulaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningArea" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "applicableGrades" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strand" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "learningAreaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubStrand" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "strandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubStrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyUnit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "credits" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyElement" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "competencyUnitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceCriterion" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enteredById" TEXT,
    "resultKind" "AssessmentResultKind" NOT NULL,
    "numericScore" DOUBLE PRECISION,
    "performanceLevel" "PerformanceLevel",
    "competencyStatus" "CompetencyStatus",
    "subjectId" TEXT,
    "paperId" TEXT,
    "learningAreaId" TEXT,
    "strandId" TEXT,
    "subStrandId" TEXT,
    "competencyUnitId" TEXT,
    "elementId" TEXT,
    "criterionId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentRole" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "role" "AssessmentRoleType" NOT NULL,
    "subjectId" TEXT,
    "learningAreaId" TEXT,
    "competencyUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingConfig" (
    "schoolId" TEXT NOT NULL,
    "improvementWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "completionWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "absoluteWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "meanFlagThreshold" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankingConfig_pkey" PRIMARY KEY ("schoolId")
);

-- CreateTable
CREATE TABLE "ReportRemark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "draftRemark" TEXT,
    "editedRemark" TEXT,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportRemark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipientGroup" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipientGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "teacherId" TEXT,
    "studentId" TEXT,
    "extName" TEXT,
    "extPhone" TEXT,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "recipientDescriptor" JSONB NOT NULL,
    "recipientSummary" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "phone" TEXT NOT NULL,
    "recipientLabel" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "providerMsgId" TEXT,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRecipientGroup" (
    "messageId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "MessageRecipientGroup_pkey" PRIMARY KEY ("messageId","groupId")
);

-- CreateTable
CREATE TABLE "MessagingSettings" (
    "schoolId" TEXT NOT NULL,
    "resultsClosing" TEXT NOT NULL DEFAULT 'Thank you for your continued support.',
    "batchSize" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingSettings_pkey" PRIMARY KEY ("schoolId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "performedById" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationSettings" (
    "schoolId" TEXT NOT NULL,
    "boardingType" "BoardingType" NOT NULL DEFAULT 'DAY_AND_BOARDING',
    "schoolGenderPolicy" "GenderPolicy" NOT NULL DEFAULT 'MIXED',
    "enableDormCaptains" BOOLEAN NOT NULL DEFAULT true,
    "enableTransfers" BOOLEAN NOT NULL DEFAULT true,
    "defaultAllocationPolicy" "AllocationPolicy" NOT NULL DEFAULT 'MIXED_FORMS',
    "occupancyWarningPct" INTEGER NOT NULL DEFAULT 90,
    "bedTrackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "analyticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnAllocation" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccommodationSettings_pkey" PRIMARY KEY ("schoolId")
);

-- CreateTable
CREATE TABLE "DormInspection" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dormId" TEXT NOT NULL,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "inspectedById" TEXT,
    "status" "InspectionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "overallRating" "InspectionRating",
    "overallScore" DOUBLE PRECISION,
    "notes" TEXT,
    "recommendations" TEXT,
    "nextInspectionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DormInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormInspectionItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "rating" "InspectionRating" NOT NULL,
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DormInspectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dormId" TEXT,
    "studentId" TEXT,
    "eventType" "AccomEventType" NOT NULL,
    "performedById" TEXT,
    "fromDormId" TEXT,
    "toDormId" TEXT,
    "fromCubicleId" TEXT,
    "toCubicleId" TEXT,
    "fromPositionId" TEXT,
    "toPositionId" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccommodationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dormitory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genderPolicy" "GenderPolicy" NOT NULL DEFAULT 'MIXED',
    "structure" "DormStructure" NOT NULL DEFAULT 'OPEN_HALL',
    "status" "DormStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalCapacity" INTEGER NOT NULL DEFAULT 0,
    "allocationPolicy" "AllocationPolicy" NOT NULL DEFAULT 'MIXED_FORMS',
    "cubiclesInheritPolicy" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "boardingMasterId" TEXT,
    "dormCaptainId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dormitory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DormPermittedForm" (
    "dormId" TEXT NOT NULL,
    "form" INTEGER NOT NULL,

    CONSTRAINT "DormPermittedForm_pkey" PRIMARY KEY ("dormId","form")
);

-- CreateTable
CREATE TABLE "Cubicle" (
    "id" TEXT NOT NULL,
    "dormId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "allocationPolicy" "AllocationPolicy",
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cubicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CubiclePermittedForm" (
    "cubicleId" TEXT NOT NULL,
    "form" INTEGER NOT NULL,

    CONSTRAINT "CubiclePermittedForm_pkey" PRIMARY KEY ("cubicleId","form")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "dormId" TEXT NOT NULL,
    "cubicleId" TEXT,
    "label" TEXT NOT NULL,
    "bedType" "BedType" NOT NULL DEFAULT 'SINGLE',
    "customOccupancy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SleepingPosition" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "dormId" TEXT NOT NULL,
    "cubicleId" TEXT,
    "position" "BedPosition",
    "customLabel" TEXT,
    "isOccupied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SleepingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "dormId" TEXT NOT NULL,
    "cubicleId" TEXT,
    "bedId" TEXT,
    "sleepingPositionId" TEXT,
    "allocationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vacatedDate" TIMESTAMP(3),
    "status" "AllocationStatus" NOT NULL DEFAULT 'CURRENT',
    "notes" TEXT,
    "allocatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");

-- CreateIndex
CREATE INDEX "User_staffRoleId_idx" ON "User"("staffRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_schoolId_email_key" ON "User"("schoolId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_headTeacherId_key" ON "Department"("headTeacherId");

-- CreateIndex
CREATE INDEX "Department_schoolId_idx" ON "Department"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_schoolId_name_key" ON "Department"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Subject_departmentId_idx" ON "Subject"("departmentId");

-- CreateIndex
CREATE INDEX "Subject_schoolId_idx" ON "Subject"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_schoolId_code_key" ON "Subject"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_schoolId_internalCode_key" ON "Subject"("schoolId", "internalCode");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_userId_key" ON "Teacher"("userId");

-- CreateIndex
CREATE INDEX "Teacher_primaryDepartmentId_idx" ON "Teacher"("primaryDepartmentId");

-- CreateIndex
CREATE INDEX "Teacher_schoolId_idx" ON "Teacher"("schoolId");

-- CreateIndex
CREATE INDEX "Teacher_schoolId_archivedAt_idx" ON "Teacher"("schoolId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_schoolId_staffId_key" ON "Teacher"("schoolId", "staffId");

-- CreateIndex
CREATE INDEX "RecycledStaffId_schoolId_staffId_idx" ON "RecycledStaffId"("schoolId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "RecycledStaffId_schoolId_staffId_key" ON "RecycledStaffId"("schoolId", "staffId");

-- CreateIndex
CREATE INDEX "StaffRole_schoolId_idx" ON "StaffRole"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffRole_schoolId_name_key" ON "StaffRole"("schoolId", "name");

-- CreateIndex
CREATE INDEX "UserStaffRole_userId_idx" ON "UserStaffRole"("userId");

-- CreateIndex
CREATE INDEX "UserStaffRole_staffRoleId_idx" ON "UserStaffRole"("staffRoleId");

-- CreateIndex
CREATE INDEX "PermissionAuditLog_schoolId_idx" ON "PermissionAuditLog"("schoolId");

-- CreateIndex
CREATE INDEX "PermissionAuditLog_performedById_idx" ON "PermissionAuditLog"("performedById");

-- CreateIndex
CREATE INDEX "PermissionAuditLog_targetUserId_idx" ON "PermissionAuditLog"("targetUserId");

-- CreateIndex
CREATE INDEX "PermissionAuditLog_staffRoleId_idx" ON "PermissionAuditLog"("staffRoleId");

-- CreateIndex
CREATE INDEX "PermissionAuditLog_schoolId_createdAt_idx" ON "PermissionAuditLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolIntegration_schoolId_idx" ON "SchoolIntegration"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolIntegration_schoolId_provider_key" ON "SchoolIntegration"("schoolId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_classTeacherId_key" ON "SchoolClass"("classTeacherId");

-- CreateIndex
CREATE INDEX "SchoolClass_schoolId_form_idx" ON "SchoolClass"("schoolId", "form");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolClass_schoolId_name_key" ON "SchoolClass"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");

-- CreateIndex
CREATE INDEX "Student_classId_idx" ON "Student"("classId");

-- CreateIndex
CREATE INDEX "Student_schoolId_idx" ON "Student"("schoolId");

-- CreateIndex
CREATE INDEX "Student_schoolId_fullName_idx" ON "Student"("schoolId", "fullName");

-- CreateIndex
CREATE INDEX "Student_schoolId_admissionNumber_idx" ON "Student"("schoolId", "admissionNumber");

-- CreateIndex
CREATE INDEX "Student_schoolId_archivedAt_idx" ON "Student"("schoolId", "archivedAt");

-- CreateIndex
CREATE INDEX "Student_schoolId_classId_archivedAt_idx" ON "Student"("schoolId", "classId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_admissionNumber_key" ON "Student"("schoolId", "admissionNumber");

-- CreateIndex
CREATE INDEX "TimetableSlot_schoolId_idx" ON "TimetableSlot"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_classId_dayOfWeek_period_key" ON "TimetableSlot"("classId", "dayOfWeek", "period");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableSlot_classId_teacherId_dayOfWeek_period_key" ON "TimetableSlot"("classId", "teacherId", "dayOfWeek", "period");

-- CreateIndex
CREATE INDEX "TimetableTemplateColumn_configId_idx" ON "TimetableTemplateColumn"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableTemplateColumn_configId_position_key" ON "TimetableTemplateColumn"("configId", "position");

-- CreateIndex
CREATE INDEX "SubjectLessonRequirement_schoolId_idx" ON "SubjectLessonRequirement"("schoolId");

-- CreateIndex
CREATE INDEX "SubjectLessonRequirement_subjectId_idx" ON "SubjectLessonRequirement"("subjectId");

-- CreateIndex
CREATE INDEX "SubjectLessonRequirement_classId_idx" ON "SubjectLessonRequirement"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectLessonRequirement_subjectId_classId_key" ON "SubjectLessonRequirement"("subjectId", "classId");

-- CreateIndex
CREATE INDEX "ClassSubjectProfile_schoolId_idx" ON "ClassSubjectProfile"("schoolId");

-- CreateIndex
CREATE INDEX "ClassSubjectProfile_classId_idx" ON "ClassSubjectProfile"("classId");

-- CreateIndex
CREATE INDEX "ClassSubjectProfile_subjectId_idx" ON "ClassSubjectProfile"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSubjectProfile_classId_subjectId_key" ON "ClassSubjectProfile"("classId", "subjectId");

-- CreateIndex
CREATE INDEX "TimetablePreference_configId_idx" ON "TimetablePreference"("configId");

-- CreateIndex
CREATE INDEX "TimetableVersion_schoolId_idx" ON "TimetableVersion"("schoolId");

-- CreateIndex
CREATE INDEX "TimetableVersion_schoolId_status_idx" ON "TimetableVersion"("schoolId", "status");

-- CreateIndex
CREATE INDEX "TimetableVersionSlot_versionId_idx" ON "TimetableVersionSlot"("versionId");

-- CreateIndex
CREATE INDEX "TimetableVersionSlot_schoolId_idx" ON "TimetableVersionSlot"("schoolId");

-- CreateIndex
CREATE INDEX "TimetableVersionSlot_versionId_classId_dayOfWeek_period_idx" ON "TimetableVersionSlot"("versionId", "classId", "dayOfWeek", "period");

-- CreateIndex
CREATE INDEX "TimetableVersionSlot_classId_idx" ON "TimetableVersionSlot"("classId");

-- CreateIndex
CREATE INDEX "TimetableVersionSlot_teacherId_idx" ON "TimetableVersionSlot"("teacherId");

-- CreateIndex
CREATE INDEX "TimetableVersionSlot_versionId_isLocked_idx" ON "TimetableVersionSlot"("versionId", "isLocked");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableVersionSlot_versionId_classId_teacherId_dayOfWeek__key" ON "TimetableVersionSlot"("versionId", "classId", "teacherId", "dayOfWeek", "period");

-- CreateIndex
CREATE INDEX "TimetableChangeLog_schoolId_idx" ON "TimetableChangeLog"("schoolId");

-- CreateIndex
CREATE INDEX "TimetableChangeLog_versionId_idx" ON "TimetableChangeLog"("versionId");

-- CreateIndex
CREATE INDEX "ClassSubjectTeacher_teacherId_idx" ON "ClassSubjectTeacher"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherUnavailability_teacherId_idx" ON "TeacherUnavailability"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherUnavailability_teacherId_dayOfWeek_period_key" ON "TeacherUnavailability"("teacherId", "dayOfWeek", "period");

-- CreateIndex
CREATE INDEX "ElectiveGroup_schoolId_idx" ON "ElectiveGroup"("schoolId");

-- CreateIndex
CREATE INDEX "ElectiveGroup_schoolId_scopeForm_idx" ON "ElectiveGroup"("schoolId", "scopeForm");

-- CreateIndex
CREATE UNIQUE INDEX "ElectiveGroup_schoolId_name_scopeForm_key" ON "ElectiveGroup"("schoolId", "name", "scopeForm");

-- CreateIndex
CREATE INDEX "ElectiveGroupMember_groupId_idx" ON "ElectiveGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "ElectiveGroupMember_subjectId_idx" ON "ElectiveGroupMember"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectiveGroupMember_groupId_subjectId_key" ON "ElectiveGroupMember"("groupId", "subjectId");

-- CreateIndex
CREATE INDEX "ElectiveGroupTeacher_groupId_idx" ON "ElectiveGroupTeacher"("groupId");

-- CreateIndex
CREATE INDEX "ElectiveGroupTeacher_subjectId_idx" ON "ElectiveGroupTeacher"("subjectId");

-- CreateIndex
CREATE INDEX "ElectiveGroupTeacher_teacherId_idx" ON "ElectiveGroupTeacher"("teacherId");

-- CreateIndex
CREATE INDEX "ElectiveGroupTeacher_schoolId_idx" ON "ElectiveGroupTeacher"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectiveGroupTeacher_groupId_subjectId_teacherId_key" ON "ElectiveGroupTeacher"("groupId", "subjectId", "teacherId");

-- CreateIndex
CREATE INDEX "ClassElectiveGroupTeacher_groupId_idx" ON "ClassElectiveGroupTeacher"("groupId");

-- CreateIndex
CREATE INDEX "ClassElectiveGroupTeacher_classId_idx" ON "ClassElectiveGroupTeacher"("classId");

-- CreateIndex
CREATE INDEX "ClassElectiveGroupTeacher_subjectId_idx" ON "ClassElectiveGroupTeacher"("subjectId");

-- CreateIndex
CREATE INDEX "ClassElectiveGroupTeacher_teacherId_idx" ON "ClassElectiveGroupTeacher"("teacherId");

-- CreateIndex
CREATE INDEX "ClassElectiveGroupTeacher_schoolId_idx" ON "ClassElectiveGroupTeacher"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassElectiveGroupTeacher_groupId_classId_subjectId_teacher_key" ON "ClassElectiveGroupTeacher"("groupId", "classId", "subjectId", "teacherId");

-- CreateIndex
CREATE INDEX "CalendarEvent_schoolId_date_idx" ON "CalendarEvent"("schoolId", "date");

-- CreateIndex
CREATE INDEX "CalendarEvent_schoolId_audience_idx" ON "CalendarEvent"("schoolId", "audience");

-- CreateIndex
CREATE INDEX "Attendance_schoolId_date_idx" ON "Attendance"("schoolId", "date");

-- CreateIndex
CREATE INDEX "Attendance_classId_date_idx" ON "Attendance"("classId", "date");

-- CreateIndex
CREATE INDEX "Attendance_studentId_date_idx" ON "Attendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "Attendance_schoolId_date_status_idx" ON "Attendance"("schoolId", "date", "status");

-- CreateIndex
CREATE INDEX "Attendance_schoolId_classId_date_idx" ON "Attendance"("schoolId", "classId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_studentId_classId_date_key" ON "Attendance"("studentId", "classId", "date");

-- CreateIndex
CREATE INDEX "DisciplineRecord_schoolId_dateOfOffence_idx" ON "DisciplineRecord"("schoolId", "dateOfOffence");

-- CreateIndex
CREATE INDEX "DisciplineRecord_studentId_dateOfOffence_idx" ON "DisciplineRecord"("studentId", "dateOfOffence");

-- CreateIndex
CREATE INDEX "DisciplineRecord_schoolId_studentId_idx" ON "DisciplineRecord"("schoolId", "studentId");

-- CreateIndex
CREATE INDEX "DisciplineRecord_schoolId_status_idx" ON "DisciplineRecord"("schoolId", "status");

-- CreateIndex
CREATE INDEX "DisciplineNote_disciplineRecordId_idx" ON "DisciplineNote"("disciplineRecordId");

-- CreateIndex
CREATE INDEX "DisciplineEvent_disciplineRecordId_createdAt_idx" ON "DisciplineEvent"("disciplineRecordId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentFile_schoolId_idx" ON "StudentFile"("schoolId");

-- CreateIndex
CREATE INDEX "StudentFile_studentId_idx" ON "StudentFile"("studentId");

-- CreateIndex
CREATE INDEX "StudentFile_disciplineRecordId_idx" ON "StudentFile"("disciplineRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentFile_studentId_sha256_key" ON "StudentFile"("studentId", "sha256");

-- CreateIndex
CREATE INDEX "Achievement_schoolId_achievementDate_idx" ON "Achievement"("schoolId", "achievementDate");

-- CreateIndex
CREATE INDEX "AchievementStudent_studentId_idx" ON "AchievementStudent"("studentId");

-- CreateIndex
CREATE INDEX "LibraryCatalogue_schoolId_idx" ON "LibraryCatalogue"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryCatalogue_schoolId_subject_idx" ON "LibraryCatalogue"("schoolId", "subject");

-- CreateIndex
CREATE INDEX "LibraryCatalogue_schoolId_form_idx" ON "LibraryCatalogue"("schoolId", "form");

-- CreateIndex
CREATE INDEX "LibraryCatalogue_schoolId_category_idx" ON "LibraryCatalogue"("schoolId", "category");

-- CreateIndex
CREATE INDEX "LibraryCatalogue_schoolId_shelf_idx" ON "LibraryCatalogue"("schoolId", "shelf");

-- CreateIndex
CREATE INDEX "LibraryCatalogue_schoolId_title_idx" ON "LibraryCatalogue"("schoolId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCatalogue_schoolId_bookNumber_key" ON "LibraryCatalogue"("schoolId", "bookNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCopy_qrCode_key" ON "LibraryCopy"("qrCode");

-- CreateIndex
CREATE INDEX "LibraryCopy_schoolId_idx" ON "LibraryCopy"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryCopy_catalogueId_idx" ON "LibraryCopy"("catalogueId");

-- CreateIndex
CREATE INDEX "LibraryCopy_schoolId_status_idx" ON "LibraryCopy"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCopy_schoolId_accessionNumber_key" ON "LibraryCopy"("schoolId", "accessionNumber");

-- CreateIndex
CREATE INDEX "LibraryBook_schoolId_idx" ON "LibraryBook"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBook_schoolId_isbn_key" ON "LibraryBook"("schoolId", "isbn");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCard_studentId_key" ON "LibraryCard"("studentId");

-- CreateIndex
CREATE INDEX "LibraryCard_schoolId_idx" ON "LibraryCard"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryCard_schoolId_status_idx" ON "LibraryCard"("schoolId", "status");

-- CreateIndex
CREATE INDEX "LibraryBorrow_schoolId_idx" ON "LibraryBorrow"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryBorrow_cardId_idx" ON "LibraryBorrow"("cardId");

-- CreateIndex
CREATE INDEX "LibraryBorrow_bookId_idx" ON "LibraryBorrow"("bookId");

-- CreateIndex
CREATE INDEX "LibraryBorrow_schoolId_returnedAt_idx" ON "LibraryBorrow"("schoolId", "returnedAt");

-- CreateIndex
CREATE INDEX "LibraryBorrow_schoolId_returnedAt_dueAt_idx" ON "LibraryBorrow"("schoolId", "returnedAt", "dueAt");

-- CreateIndex
CREATE INDEX "LibraryPolicy_schoolId_idx" ON "LibraryPolicy"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryPolicy_schoolId_patronType_key" ON "LibraryPolicy"("schoolId", "patronType");

-- CreateIndex
CREATE INDEX "LibraryFineAudit_schoolId_idx" ON "LibraryFineAudit"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryFineAudit_cardId_idx" ON "LibraryFineAudit"("cardId");

-- CreateIndex
CREATE INDEX "LibraryFineAudit_borrowId_idx" ON "LibraryFineAudit"("borrowId");

-- CreateIndex
CREATE INDEX "LibraryFinePause_schoolId_idx" ON "LibraryFinePause"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryFinePause_schoolId_isActive_idx" ON "LibraryFinePause"("schoolId", "isActive");

-- CreateIndex
CREATE INDEX "LibraryReservation_schoolId_idx" ON "LibraryReservation"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryReservation_catalogueId_idx" ON "LibraryReservation"("catalogueId");

-- CreateIndex
CREATE INDEX "LibraryReservation_studentId_idx" ON "LibraryReservation"("studentId");

-- CreateIndex
CREATE INDEX "LibraryReservation_schoolId_status_idx" ON "LibraryReservation"("schoolId", "status");

-- CreateIndex
CREATE INDEX "LibraryClassroomLoan_schoolId_idx" ON "LibraryClassroomLoan"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryClassroomLoan_catalogueId_idx" ON "LibraryClassroomLoan"("catalogueId");

-- CreateIndex
CREATE INDEX "LibraryClassroomLoan_teacherId_idx" ON "LibraryClassroomLoan"("teacherId");

-- CreateIndex
CREATE INDEX "LibraryCirculationEvent_schoolId_idx" ON "LibraryCirculationEvent"("schoolId");

-- CreateIndex
CREATE INDEX "LibraryCirculationEvent_copyId_idx" ON "LibraryCirculationEvent"("copyId");

-- CreateIndex
CREATE INDEX "LibraryCirculationEvent_catalogueId_idx" ON "LibraryCirculationEvent"("catalogueId");

-- CreateIndex
CREATE INDEX "LibraryCirculationEvent_studentId_idx" ON "LibraryCirculationEvent"("studentId");

-- CreateIndex
CREATE INDEX "LibraryCirculationEvent_schoolId_eventType_idx" ON "LibraryCirculationEvent"("schoolId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "StoredImage_storagePath_key" ON "StoredImage"("storagePath");

-- CreateIndex
CREATE INDEX "StoredImage_schoolId_idx" ON "StoredImage"("schoolId");

-- CreateIndex
CREATE INDEX "StoredImage_ownerId_idx" ON "StoredImage"("ownerId");

-- CreateIndex
CREATE INDEX "StoredImage_schoolId_ownerId_idx" ON "StoredImage"("schoolId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredReport_storagePath_key" ON "StoredReport"("storagePath");

-- CreateIndex
CREATE INDEX "StoredReport_schoolId_idx" ON "StoredReport"("schoolId");

-- CreateIndex
CREATE INDEX "StoredReport_subjectUserId_idx" ON "StoredReport"("subjectUserId");

-- CreateIndex
CREATE INDEX "StoredReport_schoolId_subjectUserId_idx" ON "StoredReport"("schoolId", "subjectUserId");

-- CreateIndex
CREATE INDEX "StoredReport_schoolId_createdAt_idx" ON "StoredReport"("schoolId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolMeta_slug_key" ON "SchoolMeta"("slug");

-- CreateIndex
CREATE INDEX "SchoolMeta_status_idx" ON "SchoolMeta"("status");

-- CreateIndex
CREATE INDEX "SchoolMeta_planTier_idx" ON "SchoolMeta"("planTier");

-- CreateIndex
CREATE INDEX "SchoolModuleToggle_schoolId_idx" ON "SchoolModuleToggle"("schoolId");

-- CreateIndex
CREATE INDEX "SystemError_schoolId_idx" ON "SystemError"("schoolId");

-- CreateIndex
CREATE INDEX "SystemError_severity_idx" ON "SystemError"("severity");

-- CreateIndex
CREATE INDEX "SystemError_status_idx" ON "SystemError"("status");

-- CreateIndex
CREATE INDEX "SystemError_createdAt_idx" ON "SystemError"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceHealth_serviceName_key" ON "ServiceHealth"("serviceName");

-- CreateIndex
CREATE INDEX "MetricSnapshot_serviceName_recordedAt_idx" ON "MetricSnapshot"("serviceName", "recordedAt");

-- CreateIndex
CREATE INDEX "IncidentLog_startedAt_idx" ON "IncidentLog"("startedAt");

-- CreateIndex
CREATE INDEX "StorageUsage_schoolId_recordedAt_idx" ON "StorageUsage"("schoolId", "recordedAt");

-- CreateIndex
CREATE INDEX "StorageUsage_schoolId_type_idx" ON "StorageUsage"("schoolId", "type");

-- CreateIndex
CREATE INDEX "ImportJob_schoolId_idx" ON "ImportJob"("schoolId");

-- CreateIndex
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_adminId_idx" ON "SuperAdminAuditLog"("adminId");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_createdAt_idx" ON "SuperAdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_targetType_targetId_idx" ON "SuperAdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "PathwayWeight_schoolId_idx" ON "PathwayWeight"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "PathwayWeight_frameworkId_subjectId_key" ON "PathwayWeight"("frameworkId", "subjectId");

-- CreateIndex
CREATE INDEX "FormSubjectExpectation_schoolId_idx" ON "FormSubjectExpectation"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubjectExpectation_schoolId_form_key" ON "FormSubjectExpectation"("schoolId", "form");

-- CreateIndex
CREATE INDEX "AssessmentFramework_schoolId_idx" ON "AssessmentFramework"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentFramework_schoolId_type_academicYear_key" ON "AssessmentFramework"("schoolId", "type", "academicYear");

-- CreateIndex
CREATE INDEX "AssessmentPeriod_schoolId_frameworkId_idx" ON "AssessmentPeriod"("schoolId", "frameworkId");

-- CreateIndex
CREATE INDEX "AssessmentPeriod_schoolId_isCurrent_idx" ON "AssessmentPeriod"("schoolId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentPeriod_schoolId_frameworkId_name_academicYear_key" ON "AssessmentPeriod"("schoolId", "frameworkId", "name", "academicYear");

-- CreateIndex
CREATE INDEX "Paper_schoolId_frameworkId_idx" ON "Paper"("schoolId", "frameworkId");

-- CreateIndex
CREATE INDEX "Paper_subjectId_idx" ON "Paper"("subjectId");

-- CreateIndex
CREATE INDEX "Paper_frameworkId_subjectId_idx" ON "Paper"("frameworkId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "Paper_frameworkId_subjectId_name_key" ON "Paper"("frameworkId", "subjectId", "name");

-- CreateIndex
CREATE INDEX "DepartmentFormulaConfig_schoolId_idx" ON "DepartmentFormulaConfig"("schoolId");

-- CreateIndex
CREATE INDEX "DepartmentFormulaConfig_departmentId_idx" ON "DepartmentFormulaConfig"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentFormulaConfig_subjectId_form_frameworkId_idx" ON "DepartmentFormulaConfig"("subjectId", "form", "frameworkId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentFormulaConfig_departmentId_subjectId_form_framewo_key" ON "DepartmentFormulaConfig"("departmentId", "subjectId", "form", "frameworkId");

-- CreateIndex
CREATE INDEX "LearningArea_schoolId_frameworkId_idx" ON "LearningArea"("schoolId", "frameworkId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningArea_frameworkId_name_key" ON "LearningArea"("frameworkId", "name");

-- CreateIndex
CREATE INDEX "Strand_schoolId_idx" ON "Strand"("schoolId");

-- CreateIndex
CREATE INDEX "Strand_learningAreaId_idx" ON "Strand"("learningAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "Strand_learningAreaId_name_key" ON "Strand"("learningAreaId", "name");

-- CreateIndex
CREATE INDEX "SubStrand_schoolId_idx" ON "SubStrand"("schoolId");

-- CreateIndex
CREATE INDEX "SubStrand_strandId_idx" ON "SubStrand"("strandId");

-- CreateIndex
CREATE UNIQUE INDEX "SubStrand_strandId_name_key" ON "SubStrand"("strandId", "name");

-- CreateIndex
CREATE INDEX "CompetencyUnit_schoolId_frameworkId_idx" ON "CompetencyUnit"("schoolId", "frameworkId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyUnit_frameworkId_name_key" ON "CompetencyUnit"("frameworkId", "name");

-- CreateIndex
CREATE INDEX "CompetencyElement_schoolId_idx" ON "CompetencyElement"("schoolId");

-- CreateIndex
CREATE INDEX "CompetencyElement_competencyUnitId_idx" ON "CompetencyElement"("competencyUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyElement_competencyUnitId_name_key" ON "CompetencyElement"("competencyUnitId", "name");

-- CreateIndex
CREATE INDEX "PerformanceCriterion_schoolId_idx" ON "PerformanceCriterion"("schoolId");

-- CreateIndex
CREATE INDEX "PerformanceCriterion_elementId_idx" ON "PerformanceCriterion"("elementId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceCriterion_elementId_name_key" ON "PerformanceCriterion"("elementId", "name");

-- CreateIndex
CREATE INDEX "AssessmentItem_schoolId_frameworkId_periodId_idx" ON "AssessmentItem"("schoolId", "frameworkId", "periodId");

-- CreateIndex
CREATE INDEX "AssessmentItem_studentId_idx" ON "AssessmentItem"("studentId");

-- CreateIndex
CREATE INDEX "AssessmentItem_enteredById_idx" ON "AssessmentItem"("enteredById");

-- CreateIndex
CREATE INDEX "AssessmentItem_learningAreaId_periodId_idx" ON "AssessmentItem"("learningAreaId", "periodId");

-- CreateIndex
CREATE INDEX "AssessmentItem_competencyUnitId_periodId_idx" ON "AssessmentItem"("competencyUnitId", "periodId");

-- CreateIndex
CREATE INDEX "AssessmentItem_periodId_studentId_resultKind_idx" ON "AssessmentItem"("periodId", "studentId", "resultKind");

-- CreateIndex
CREATE INDEX "AssessmentItem_subjectId_periodId_idx" ON "AssessmentItem"("subjectId", "periodId");

-- CreateIndex
CREATE INDEX "AssessmentItem_schoolId_periodId_subjectId_idx" ON "AssessmentItem"("schoolId", "periodId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentItem_studentId_periodId_paperId_key" ON "AssessmentItem"("studentId", "periodId", "paperId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentItem_studentId_periodId_subStrandId_key" ON "AssessmentItem"("studentId", "periodId", "subStrandId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentItem_studentId_periodId_criterionId_key" ON "AssessmentItem"("studentId", "periodId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentItem_studentId_periodId_subjectId_paperId_key" ON "AssessmentItem"("studentId", "periodId", "subjectId", "paperId");

-- CreateIndex
CREATE INDEX "AssessmentRole_schoolId_frameworkId_idx" ON "AssessmentRole"("schoolId", "frameworkId");

-- CreateIndex
CREATE INDEX "AssessmentRole_teacherId_idx" ON "AssessmentRole"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentRole_frameworkId_teacherId_role_subjectId_learnin_key" ON "AssessmentRole"("frameworkId", "teacherId", "role", "subjectId", "learningAreaId", "competencyUnitId");

-- CreateIndex
CREATE INDEX "ReportRemark_schoolId_periodId_idx" ON "ReportRemark"("schoolId", "periodId");

-- CreateIndex
CREATE INDEX "ReportRemark_periodId_studentId_idx" ON "ReportRemark"("periodId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRemark_schoolId_periodId_studentId_key" ON "ReportRemark"("schoolId", "periodId", "studentId");

-- CreateIndex
CREATE INDEX "RecipientGroup_schoolId_idx" ON "RecipientGroup"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipientGroup_schoolId_name_key" ON "RecipientGroup"("schoolId", "name");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_idx" ON "GroupMember"("groupId");

-- CreateIndex
CREATE INDEX "GroupMember_teacherId_idx" ON "GroupMember"("teacherId");

-- CreateIndex
CREATE INDEX "GroupMember_studentId_idx" ON "GroupMember"("studentId");

-- CreateIndex
CREATE INDEX "MessageTemplate_schoolId_idx" ON "MessageTemplate"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_schoolId_name_key" ON "MessageTemplate"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Message_schoolId_idx" ON "Message"("schoolId");

-- CreateIndex
CREATE INDEX "Message_schoolId_createdAt_idx" ON "Message"("schoolId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Message_schoolId_status_idx" ON "Message"("schoolId", "status");

-- CreateIndex
CREATE INDEX "Message_senderUserId_idx" ON "Message"("senderUserId");

-- CreateIndex
CREATE INDEX "MessageLog_messageId_idx" ON "MessageLog"("messageId");

-- CreateIndex
CREATE INDEX "MessageLog_schoolId_idx" ON "MessageLog"("schoolId");

-- CreateIndex
CREATE INDEX "MessageLog_schoolId_status_idx" ON "MessageLog"("schoolId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_performedAt_idx" ON "AuditLog"("schoolId", "performedAt");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_action_idx" ON "AuditLog"("schoolId", "action");

-- CreateIndex
CREATE INDEX "DormInspection_schoolId_idx" ON "DormInspection"("schoolId");

-- CreateIndex
CREATE INDEX "DormInspection_dormId_idx" ON "DormInspection"("dormId");

-- CreateIndex
CREATE INDEX "DormInspection_schoolId_inspectionDate_idx" ON "DormInspection"("schoolId", "inspectionDate");

-- CreateIndex
CREATE INDEX "DormInspectionItem_inspectionId_idx" ON "DormInspectionItem"("inspectionId");

-- CreateIndex
CREATE INDEX "AccommodationEvent_schoolId_idx" ON "AccommodationEvent"("schoolId");

-- CreateIndex
CREATE INDEX "AccommodationEvent_dormId_idx" ON "AccommodationEvent"("dormId");

-- CreateIndex
CREATE INDEX "AccommodationEvent_studentId_idx" ON "AccommodationEvent"("studentId");

-- CreateIndex
CREATE INDEX "AccommodationEvent_schoolId_createdAt_idx" ON "AccommodationEvent"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "AccommodationEvent_schoolId_eventType_idx" ON "AccommodationEvent"("schoolId", "eventType");

-- CreateIndex
CREATE INDEX "Dormitory_schoolId_idx" ON "Dormitory"("schoolId");

-- CreateIndex
CREATE INDEX "Dormitory_schoolId_status_idx" ON "Dormitory"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Dormitory_schoolId_name_key" ON "Dormitory"("schoolId", "name");

-- CreateIndex
CREATE INDEX "DormPermittedForm_dormId_idx" ON "DormPermittedForm"("dormId");

-- CreateIndex
CREATE INDEX "Cubicle_dormId_idx" ON "Cubicle"("dormId");

-- CreateIndex
CREATE INDEX "Cubicle_schoolId_idx" ON "Cubicle"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Cubicle_dormId_name_key" ON "Cubicle"("dormId", "name");

-- CreateIndex
CREATE INDEX "CubiclePermittedForm_cubicleId_idx" ON "CubiclePermittedForm"("cubicleId");

-- CreateIndex
CREATE INDEX "Bed_dormId_idx" ON "Bed"("dormId");

-- CreateIndex
CREATE INDEX "Bed_cubicleId_idx" ON "Bed"("cubicleId");

-- CreateIndex
CREATE INDEX "Bed_schoolId_idx" ON "Bed"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_dormId_label_key" ON "Bed"("dormId", "label");

-- CreateIndex
CREATE INDEX "SleepingPosition_dormId_idx" ON "SleepingPosition"("dormId");

-- CreateIndex
CREATE INDEX "SleepingPosition_schoolId_idx" ON "SleepingPosition"("schoolId");

-- CreateIndex
CREATE INDEX "AllocationRecord_schoolId_idx" ON "AllocationRecord"("schoolId");

-- CreateIndex
CREATE INDEX "AllocationRecord_studentId_idx" ON "AllocationRecord"("studentId");

-- CreateIndex
CREATE INDEX "AllocationRecord_dormId_idx" ON "AllocationRecord"("dormId");

-- CreateIndex
CREATE INDEX "AllocationRecord_studentId_status_idx" ON "AllocationRecord"("studentId", "status");

-- CreateIndex
CREATE INDEX "AllocationRecord_schoolId_status_idx" ON "AllocationRecord"("schoolId", "status");

-- CreateIndex
CREATE INDEX "AllocationRecord_dormId_status_idx" ON "AllocationRecord"("dormId", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headTeacherId_fkey" FOREIGN KEY ("headTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_primaryDepartmentId_fkey" FOREIGN KEY ("primaryDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecycledStaffId" ADD CONSTRAINT "RecycledStaffId_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStaffRole" ADD CONSTRAINT "UserStaffRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStaffRole" ADD CONSTRAINT "UserStaffRole_staffRoleId_fkey" FOREIGN KEY ("staffRoleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionAuditLog" ADD CONSTRAINT "PermissionAuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionAuditLog" ADD CONSTRAINT "PermissionAuditLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionAuditLog" ADD CONSTRAINT "PermissionAuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolIntegration" ADD CONSTRAINT "SchoolIntegration_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_classTeacherId_fkey" FOREIGN KEY ("classTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentElective" ADD CONSTRAINT "StudentElective_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentElective" ADD CONSTRAINT "StudentElective_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableConfig" ADD CONSTRAINT "TimetableConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableTemplateColumn" ADD CONSTRAINT "TimetableTemplateColumn_configId_fkey" FOREIGN KEY ("configId") REFERENCES "TimetableConfig"("schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectLessonRequirement" ADD CONSTRAINT "SubjectLessonRequirement_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectLessonRequirement" ADD CONSTRAINT "SubjectLessonRequirement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectProfile" ADD CONSTRAINT "ClassSubjectProfile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectProfile" ADD CONSTRAINT "ClassSubjectProfile_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectProfile" ADD CONSTRAINT "ClassSubjectProfile_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetablePreference" ADD CONSTRAINT "TimetablePreference_configId_fkey" FOREIGN KEY ("configId") REFERENCES "TimetableConfig"("schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableVersion" ADD CONSTRAINT "TimetableVersion_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableVersionSlot" ADD CONSTRAINT "TimetableVersionSlot_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TimetableVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableVersionSlot" ADD CONSTRAINT "TimetableVersionSlot_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableChangeLog" ADD CONSTRAINT "TimetableChangeLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableChangeLog" ADD CONSTRAINT "TimetableChangeLog_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TimetableVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectTeacher" ADD CONSTRAINT "ClassSubjectTeacher_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectTeacher" ADD CONSTRAINT "ClassSubjectTeacher_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSubjectTeacher" ADD CONSTRAINT "ClassSubjectTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherUnavailability" ADD CONSTRAINT "TeacherUnavailability_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectiveGroup" ADD CONSTRAINT "ElectiveGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectiveGroupMember" ADD CONSTRAINT "ElectiveGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ElectiveGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectiveGroupMember" ADD CONSTRAINT "ElectiveGroupMember_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectiveGroupTeacher" ADD CONSTRAINT "ElectiveGroupTeacher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ElectiveGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectiveGroupTeacher" ADD CONSTRAINT "ElectiveGroupTeacher_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectiveGroupTeacher" ADD CONSTRAINT "ElectiveGroupTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectiveGroupTeacher" ADD CONSTRAINT "ElectiveGroupTeacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassElectiveGroupTeacher" ADD CONSTRAINT "ClassElectiveGroupTeacher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ElectiveGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassElectiveGroupTeacher" ADD CONSTRAINT "ClassElectiveGroupTeacher_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassElectiveGroupTeacher" ADD CONSTRAINT "ClassElectiveGroupTeacher_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassElectiveGroupTeacher" ADD CONSTRAINT "ClassElectiveGroupTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassElectiveGroupTeacher" ADD CONSTRAINT "ClassElectiveGroupTeacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineRecord" ADD CONSTRAINT "DisciplineRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineRecord" ADD CONSTRAINT "DisciplineRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineRecord" ADD CONSTRAINT "DisciplineRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineNote" ADD CONSTRAINT "DisciplineNote_disciplineRecordId_fkey" FOREIGN KEY ("disciplineRecordId") REFERENCES "DisciplineRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineNote" ADD CONSTRAINT "DisciplineNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineEvent" ADD CONSTRAINT "DisciplineEvent_disciplineRecordId_fkey" FOREIGN KEY ("disciplineRecordId") REFERENCES "DisciplineRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineEvent" ADD CONSTRAINT "DisciplineEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFile" ADD CONSTRAINT "StudentFile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFile" ADD CONSTRAINT "StudentFile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFile" ADD CONSTRAINT "StudentFile_disciplineRecordId_fkey" FOREIGN KEY ("disciplineRecordId") REFERENCES "DisciplineRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentFile" ADD CONSTRAINT "StudentFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementStudent" ADD CONSTRAINT "AchievementStudent_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementStudent" ADD CONSTRAINT "AchievementStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibrarySettings" ADD CONSTRAINT "LibrarySettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCatalogue" ADD CONSTRAINT "LibraryCatalogue_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCopy" ADD CONSTRAINT "LibraryCopy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCopy" ADD CONSTRAINT "LibraryCopy_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "LibraryCatalogue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryBook" ADD CONSTRAINT "LibraryBook_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCard" ADD CONSTRAINT "LibraryCard_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCard" ADD CONSTRAINT "LibraryCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryBorrow" ADD CONSTRAINT "LibraryBorrow_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryBorrow" ADD CONSTRAINT "LibraryBorrow_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "LibraryCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryBorrow" ADD CONSTRAINT "LibraryBorrow_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryBorrow" ADD CONSTRAINT "LibraryBorrow_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "LibraryCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryPolicy" ADD CONSTRAINT "LibraryPolicy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryFineAudit" ADD CONSTRAINT "LibraryFineAudit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryFinePause" ADD CONSTRAINT "LibraryFinePause_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryReservation" ADD CONSTRAINT "LibraryReservation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryReservation" ADD CONSTRAINT "LibraryReservation_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "LibraryCatalogue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryClassroomLoan" ADD CONSTRAINT "LibraryClassroomLoan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryClassroomLoan" ADD CONSTRAINT "LibraryClassroomLoan_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "LibraryCatalogue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCirculationEvent" ADD CONSTRAINT "LibraryCirculationEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryCirculationEvent" ADD CONSTRAINT "LibraryCirculationEvent_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "LibraryCatalogue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredImage" ADD CONSTRAINT "StoredImage_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredReport" ADD CONSTRAINT "StoredReport_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolMeta" ADD CONSTRAINT "SchoolMeta_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolModuleToggle" ADD CONSTRAINT "SchoolModuleToggle_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemError" ADD CONSTRAINT "SystemError_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageUsage" ADD CONSTRAINT "StorageUsage_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayWeight" ADD CONSTRAINT "PathwayWeight_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayWeight" ADD CONSTRAINT "PathwayWeight_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayWeight" ADD CONSTRAINT "PathwayWeight_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubjectExpectation" ADD CONSTRAINT "FormSubjectExpectation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentFramework" ADD CONSTRAINT "AssessmentFramework_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPeriod" ADD CONSTRAINT "AssessmentPeriod_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentPeriod" ADD CONSTRAINT "AssessmentPeriod_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paper" ADD CONSTRAINT "Paper_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paper" ADD CONSTRAINT "Paper_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paper" ADD CONSTRAINT "Paper_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentFormulaConfig" ADD CONSTRAINT "DepartmentFormulaConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentFormulaConfig" ADD CONSTRAINT "DepartmentFormulaConfig_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentFormulaConfig" ADD CONSTRAINT "DepartmentFormulaConfig_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningArea" ADD CONSTRAINT "LearningArea_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningArea" ADD CONSTRAINT "LearningArea_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strand" ADD CONSTRAINT "Strand_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Strand" ADD CONSTRAINT "Strand_learningAreaId_fkey" FOREIGN KEY ("learningAreaId") REFERENCES "LearningArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubStrand" ADD CONSTRAINT "SubStrand_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubStrand" ADD CONSTRAINT "SubStrand_strandId_fkey" FOREIGN KEY ("strandId") REFERENCES "Strand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyUnit" ADD CONSTRAINT "CompetencyUnit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyUnit" ADD CONSTRAINT "CompetencyUnit_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyElement" ADD CONSTRAINT "CompetencyElement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyElement" ADD CONSTRAINT "CompetencyElement_competencyUnitId_fkey" FOREIGN KEY ("competencyUnitId") REFERENCES "CompetencyUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceCriterion" ADD CONSTRAINT "PerformanceCriterion_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceCriterion" ADD CONSTRAINT "PerformanceCriterion_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "CompetencyElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AssessmentPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_learningAreaId_fkey" FOREIGN KEY ("learningAreaId") REFERENCES "LearningArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_strandId_fkey" FOREIGN KEY ("strandId") REFERENCES "Strand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_subStrandId_fkey" FOREIGN KEY ("subStrandId") REFERENCES "SubStrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_competencyUnitId_fkey" FOREIGN KEY ("competencyUnitId") REFERENCES "CompetencyUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "CompetencyElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "AssessmentItem_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "PerformanceCriterion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRole" ADD CONSTRAINT "AssessmentRole_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRole" ADD CONSTRAINT "AssessmentRole_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "AssessmentFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRole" ADD CONSTRAINT "AssessmentRole_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRole" ADD CONSTRAINT "AssessmentRole_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRole" ADD CONSTRAINT "AssessmentRole_learningAreaId_fkey" FOREIGN KEY ("learningAreaId") REFERENCES "LearningArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentRole" ADD CONSTRAINT "AssessmentRole_competencyUnitId_fkey" FOREIGN KEY ("competencyUnitId") REFERENCES "CompetencyUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingConfig" ADD CONSTRAINT "RankingConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "AssessmentPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRemark" ADD CONSTRAINT "ReportRemark_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipientGroup" ADD CONSTRAINT "RecipientGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RecipientGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipientGroup" ADD CONSTRAINT "MessageRecipientGroup_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipientGroup" ADD CONSTRAINT "MessageRecipientGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RecipientGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingSettings" ADD CONSTRAINT "MessagingSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationSettings" ADD CONSTRAINT "AccommodationSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormInspection" ADD CONSTRAINT "DormInspection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormInspection" ADD CONSTRAINT "DormInspection_dormId_fkey" FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormInspection" ADD CONSTRAINT "DormInspection_inspectedById_fkey" FOREIGN KEY ("inspectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormInspectionItem" ADD CONSTRAINT "DormInspectionItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "DormInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationEvent" ADD CONSTRAINT "AccommodationEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationEvent" ADD CONSTRAINT "AccommodationEvent_dormId_fkey" FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationEvent" ADD CONSTRAINT "AccommodationEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationEvent" ADD CONSTRAINT "AccommodationEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dormitory" ADD CONSTRAINT "Dormitory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dormitory" ADD CONSTRAINT "Dormitory_boardingMasterId_fkey" FOREIGN KEY ("boardingMasterId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dormitory" ADD CONSTRAINT "Dormitory_dormCaptainId_fkey" FOREIGN KEY ("dormCaptainId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DormPermittedForm" ADD CONSTRAINT "DormPermittedForm_dormId_fkey" FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cubicle" ADD CONSTRAINT "Cubicle_dormId_fkey" FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cubicle" ADD CONSTRAINT "Cubicle_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CubiclePermittedForm" ADD CONSTRAINT "CubiclePermittedForm_cubicleId_fkey" FOREIGN KEY ("cubicleId") REFERENCES "Cubicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_dormId_fkey" FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_cubicleId_fkey" FOREIGN KEY ("cubicleId") REFERENCES "Cubicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepingPosition" ADD CONSTRAINT "SleepingPosition_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepingPosition" ADD CONSTRAINT "SleepingPosition_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepingPosition" ADD CONSTRAINT "SleepingPosition_dormId_fkey" FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepingPosition" ADD CONSTRAINT "SleepingPosition_cubicleId_fkey" FOREIGN KEY ("cubicleId") REFERENCES "Cubicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecord" ADD CONSTRAINT "AllocationRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecord" ADD CONSTRAINT "AllocationRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecord" ADD CONSTRAINT "AllocationRecord_dormId_fkey" FOREIGN KEY ("dormId") REFERENCES "Dormitory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecord" ADD CONSTRAINT "AllocationRecord_cubicleId_fkey" FOREIGN KEY ("cubicleId") REFERENCES "Cubicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecord" ADD CONSTRAINT "AllocationRecord_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecord" ADD CONSTRAINT "AllocationRecord_sleepingPositionId_fkey" FOREIGN KEY ("sleepingPositionId") REFERENCES "SleepingPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationRecord" ADD CONSTRAINT "AllocationRecord_allocatedById_fkey" FOREIGN KEY ("allocatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- SECTION 2: CHECK CONSTRAINTS
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "chk_ai_result_mutex" CHECK (("resultKind"='NUMERIC' AND "numericScore" IS NOT NULL AND "performanceLevel" IS NULL AND "competencyStatus" IS NULL) OR ("resultKind"='PERFORMANCE_LEVEL' AND "numericScore" IS NULL AND "performanceLevel" IS NOT NULL AND "competencyStatus" IS NULL) OR ("resultKind"='COMPETENCY_STATUS' AND "numericScore" IS NULL AND "performanceLevel" IS NULL AND "competencyStatus" IS NOT NULL));
ALTER TABLE "AssessmentItem" ADD CONSTRAINT "chk_ai_scope_mutex" CHECK ((("subjectId" IS NOT NULL)::int+("learningAreaId" IS NOT NULL)::int+("competencyUnitId" IS NOT NULL)::int)<=1 AND ("paperId" IS NULL OR "subjectId" IS NOT NULL) AND ("strandId" IS NULL OR "learningAreaId" IS NOT NULL) AND ("subStrandId" IS NULL OR "strandId" IS NOT NULL) AND ("elementId" IS NULL OR "competencyUnitId" IS NOT NULL) AND ("criterionId" IS NULL OR "elementId" IS NOT NULL));
ALTER TABLE "AssessmentRole" ADD CONSTRAINT "chk_ar_scope_mutex" CHECK ((("subjectId" IS NOT NULL)::int+("learningAreaId" IS NOT NULL)::int+("competencyUnitId" IS NOT NULL)::int)<=1);
ALTER TABLE "PathwayWeight" ADD CONSTRAINT "chk_pw_sum" CHECK ("sbaWeight"+"examWeight"=1.0);

-- SECTION 3: SUPER ADMIN SEED
-- Migration: seed_super_admin
-- 1. Adds SUPER_ADMIN to the Role enum (if not already present)
-- 2. Creates the platform school row
-- 3. Inserts the SUPER_ADMIN user
-- Fully idempotent — safe to run multiple times.

-- Role enum already contains SUPER_ADMIN (Section 1) -- no action needed

-- ── 2. Platform school ────────────────────────────────────────────────────────
INSERT INTO "School" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('platform_school_bidii', 'Bidii Platform', 'bidii-platform', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET "updatedAt" = NOW();

-- ── 3. SUPER_ADMIN user ───────────────────────────────────────────────────────
-- Password: Bidii@2026  (bcrypt $2b$12$ hash)
INSERT INTO "User" (
  "id", "email", "passwordHash", "role",
  "mustChangePassword", "isActive", "schoolId", "createdAt", "updatedAt"
)
VALUES (
  'super_admin_bidii',
  'bidiisoftwares.1.ke@gmail.com',
  '$2b$12$s1nDaDbQNpMVwiHFvDUGhOCOxp5b.Ye.JOGvcedhQTwWC6umwez72',
  'SUPER_ADMIN',
  FALSE,
  TRUE,
  'platform_school_bidii',
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "email"        = EXCLUDED."email",
  "passwordHash" = EXCLUDED."passwordHash",
  "isActive"     = TRUE,
  "updatedAt"    = NOW();

-- SECTION 4: NULLABLE schoolId FOR SUPER_ADMIN
-- Migration: super_admin_nullable_school
-- Makes User.schoolId nullable so SUPER_ADMIN accounts don't need a school.
-- Also drops the school FK constraint for null-schoolId rows.

-- Drop old FK and unique index first
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_schoolId_fkey";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_schoolId_email_key";

-- Make schoolId nullable
ALTER TABLE "User" ALTER COLUMN "schoolId" DROP NOT NULL;

-- Re-add FK (only fires when schoolId is not null)
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_schoolId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id")
  ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- Re-add unique constraint scoped to non-null schoolId rows only
CREATE UNIQUE INDEX IF NOT EXISTS "User_schoolId_email_key"
  ON "User"("schoolId", "email")
  WHERE "schoolId" IS NOT NULL;

-- Update the existing SUPER_ADMIN row to have no schoolId
UPDATE "User" SET "schoolId" = NULL WHERE id = 'super_admin_bidii';

-- SECTION 5: REMOVE TIMETABLE SLOT UNIQUE CONSTRAINT
-- Remove the unique constraint that prevents multiple subjects per class slot
-- This is needed for elective groups to work properly

DROP INDEX IF EXISTS "TimetableVersionSlot_class_slot_key";

-- Add a regular index for query performance
CREATE INDEX IF NOT EXISTS "TimetableVersionSlot_class_slot_idx" 
  ON "TimetableVersionSlot"("versionId", "classId", "dayOfWeek", "period");
-- SECTION 6: PRISMA MIGRATION HISTORY
CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" VARCHAR(36) NOT NULL,"checksum" VARCHAR(64) NOT NULL,"finished_at" TIMESTAMPTZ,"migration_name" VARCHAR(255) NOT NULL,"logs" TEXT,"rolled_back_at" TIMESTAMPTZ,"started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),"applied_steps_count" INTEGER NOT NULL DEFAULT 0,CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id"));
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'ff775f99890a086140c8563df16b917ebf669dd1',now(),'20260715000000_add_calendar_attendance',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'84c18f0eb31e1e03cfbb243041bfebb0fb7c408c',now(),'20260715100000_two_state_attendance',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'dadce5b4636396c9c0a530b7b475b6a075c254ec',now(),'20260715110000_add_term_dates_to_exam_period',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'4dc5155116a4962229ebd26c67ceb193193de9cc',now(),'20260715120000_add_term_dates_to_calendar_event',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'96548313f85543dacc079e4fa03b5d4cfb4282bb',now(),'20260716000000_records_split_permissions',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'b39c191c5e0ecd80eb04605648db107b98661f76',now(),'20260718000000_add_assessment_framework',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'269a62a96259715ea2085675421cc2a664c1f864',now(),'20260719000000_add_cbe_class_framework_and_pathway_weight',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'a371f6357369f54939519b8e0eb5b7d07fbdfa78',now(),'20260720000000_add_ranking_config_and_report_remark',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'94e31142b2717c056f39be4c82b6126306a01e0a',now(),'20260720100000_add_form_subject_expectation',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'9b524d3f931813fd2bd8ba532a9328e3d67973c4',now(),'20260720200000_db_query_indexes',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'7800ecb4b1f08e9eb6365c80128576f48b6e5bb2',now(),'20260721000000_add_mean_flag_threshold',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'91210d6a55e57cb3e4fcb7a124f150c83659b829',now(),'20260722000000_add_library_management',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'ff30aa69fcd056344cbad4a04fd8f616199529dd',now(),'20260722100000_add_perf_indexes',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'969d679a4c4b456fd989f40b5156befbaea35cdc',now(),'20260722200000_add_messaging_module',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'3853db5ea15764dd92d9b8054f8ccabcc93a21b3',now(),'20260722300000_library_v2_enterprise',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'36226ae13d3dcba36e4b99acb9d8c6360f95c31a',now(),'20260722400000_library_stage2_circulation',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'24dbc63d8dca22bd2f605240a6a87abe049a994b',now(),'20260723000000_scale_indexes',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'6ef24375b7060c1458696d23b27c8200f0643adb',now(),'20260723100000_add_attendance_module',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'897f04e62bde718fba578cd527d02e5d5535a584',now(),'20260723100000_add_calendar_audience',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'0d186b3b59440d04fbad1b24f03b954493be665f',now(),'20260723200000_add_assessment_period_dates',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'3ce755e4a693b33af36d16d3ff304a5731956bcd',now(),'20260723200000_rbac_v2_granular_permissions',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'f70b472016e619e692000b0b74855fc505c3e1ed',now(),'20260724000000_add_lifecycle_management',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'b60329ed6b4257f351cca5a415edf1bb04591886',now(),'20260725000000_add_accommodation_module',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'1d478b7d6ebd3fea205116e8f2599be84ef4992d',now(),'20260725000000_enterprise_timetable_engine',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'25cc2278f8c76d71cecc35c5a810148d679fda56',now(),'20260725000000_per_school_email_unique',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'89245b591873bb59f3ca7f40f9690916e0dfd80b',now(),'20260726000000_add_accommodation_operations',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'77ad9629d562a44693676031bb0b39471ffedeb5',now(),'20260726000000_timetable_overrides',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'6693f9fadd6952c908dfa91807c57b62a37e4b7b',now(),'20260726100000_school_config_gender_designation',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'ce04a470233dd249f6696d53f8634abf3fecc4cc',now(),'20260727000000_add_boarding_status_to_student',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'0c604d487962e1294dd2490131149f40e5412969',now(),'20260727000000_add_maintenance_hold_status',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'1ec95241eb2eedc1f16c6d2f536e75fe22f84a24',now(),'20260729000000_deterministic_timetable_engine',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'d38eeb9b74910708a0a808a0647623ec49464869',now(),'20260729100000_fix_timetable_schema_sync',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'864d602b4cd5d804e2b2fc879b281456287900df',now(),'20260731000000_elective_group_streams_and_teachers',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'3216034888f2774d1255790961026d4a3c0f39ca',now(),'20260731100000_class_elective_group_teacher',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'dc1d3802fc1a19f53cf7b5208cf7043c7684663a',now(),'20260801000000_add_vulnerabilities_to_timetable_version',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'31b1bc4f9f1d32201d053d8c329c6042eba48fd0',now(),'20260801100000_add_elective_group_doubles_per_week',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'da62de28f893ef221d9026a3433ce4aa426689a7',now(),'20260803000000_widen_teacher_slot_constraints',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'3b83bee8cdfd2e9dcffe1bcca29c53745e7f0c26',now(),'20260810000000_add_student_photo_url',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'9e1c083a3188d2dc6ddcb140562ade1859370fd1',now(),'20260810100000_add_user_avatar_url',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'3404d483d37fd9274c5b46439cb1848bc3f9381b',now(),'20260811000000_supabase_otp_storage',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'8b654ca1b811922781517f09c51737f0d4ef7357',now(),'20260812000000_seed_super_admin',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'f7a9b068b2bf31efeffaf65d7c018b0f5bd68854',now(),'20260812100000_super_admin_nullable_school',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'0afc1387bff7c1a6c1cebad2a2f5d2d2fb7b72a9',now(),'20260813134126_add_performance_indexes',1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count") VALUES (gen_random_uuid(),'bcdc17c31860b1096dbf08d4f76b01e9314f03c3',now(),'99999999999999_remove_class_slot_unique_constraint',1) ON CONFLICT DO NOTHING;

-- Done. Database ready for pilot testing.
