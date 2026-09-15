-- Diagnostic SQL queries to check why marks cannot be saved
-- Run these queries in your database to diagnose the issue

-- ============================================================================
-- Step 1: Find Felix Njeri's user and teacher records
-- ============================================================================
SELECT 
  u.id as user_id,
  u.email,
  u.role as user_role,
  t.id as teacher_id,
  sc.id as class_teacher_of_id,
  sc.name as class_teacher_of_name
FROM "User" u
LEFT JOIN "Teacher" t ON t."userId" = u.id
LEFT JOIN "SchoolClass" sc ON sc."classTeacherId" = t.id
WHERE u.email = 'felix@example.com' -- Replace with Felix's actual email
  OR u."fullName" ILIKE '%Felix%Njeri%';

-- ============================================================================
-- Step 2: Check Assessment Roles for this teacher
-- ============================================================================
-- Replace 'TEACHER_ID_HERE' with the teacher_id from Step 1
SELECT 
  ar.id,
  ar.role,
  s.name as subject_name,
  s.code as subject_code,
  ar."subjectId",
  ar."frameworkId"
FROM "AssessmentRole" ar
LEFT JOIN "Subject" s ON s.id = ar."subjectId"
WHERE ar."teacherId" = 'TEACHER_ID_HERE';

-- ============================================================================
-- Step 3: Check Timetable Subject Assignments (Fallback)
-- ============================================================================
-- Replace 'TEACHER_ID_HERE' with the teacher_id from Step 1
-- This checks ClassSubjectTeacher assignments
SELECT 
  cst.id,
  s.name as subject_name,
  s.code as subject_code,
  sc.name as class_name,
  cst."subjectId"
FROM "ClassSubjectTeacher" cst
JOIN "Subject" s ON s.id = cst."subjectId"
JOIN "SchoolClass" sc ON sc.id = cst."classId"
WHERE cst."teacherId" = 'TEACHER_ID_HERE';

-- Also check ClassElectiveGroupTeacher assignments
SELECT 
  cegt.id,
  s.name as subject_name,
  s.code as subject_code,
  ceg.name as elective_group_name,
  cegt."subjectId"
FROM "ClassElectiveGroupTeacher" cegt
JOIN "Subject" s ON s.id = cegt."subjectId"
JOIN "ClassElectiveGroup" ceg ON ceg.id = cegt."classElectiveGroupId"
WHERE cegt."teacherId" = 'TEACHER_ID_HERE';

-- ============================================================================
-- Step 4: Find the Mathematics (M&T) subject ID
-- ============================================================================
SELECT 
  id,
  name,
  code,
  "frameworkType"
FROM "Subject"
WHERE name ILIKE '%math%'
  AND (code = 'M&T' OR name ILIKE '%M&T%');

-- ============================================================================
-- Step 5: Check if the specific subject assignment exists
-- ============================================================================
-- Replace 'TEACHER_ID_HERE' with teacher_id from Step 1
-- Replace 'SUBJECT_ID_HERE' with the Mathematics (M&T) subject_id from Step 4

-- Check in Assessment Roles
SELECT COUNT(*) as has_assessment_role
FROM "AssessmentRole"
WHERE "teacherId" = 'TEACHER_ID_HERE'
  AND ("subjectId" = 'SUBJECT_ID_HERE' OR "subjectId" IS NULL);

-- Check in Timetable Assignments
SELECT COUNT(*) as has_timetable_assignment
FROM "ClassSubjectTeacher"
WHERE "teacherId" = 'TEACHER_ID_HERE'
  AND "subjectId" = 'SUBJECT_ID_HERE';

-- ============================================================================
-- Step 6: Check the Period and Papers exist
-- ============================================================================
-- Replace with the actual periodId from the URL
SELECT 
  ap.id,
  ap.name as period_name,
  ap."academicYear",
  ap.term,
  af.name as framework_name
FROM "AssessmentPeriod" ap
JOIN "AssessmentFramework" af ON af.id = ap."frameworkId"
WHERE ap.id = 'PERIOD_ID_FROM_URL';

-- Check papers for this subject and framework
-- Replace SUBJECT_ID_HERE and FRAMEWORK_ID_HERE
SELECT 
  p.id,
  p.name as paper_name,
  p."maxMarks",
  p."sortOrder"
FROM "Paper" p
WHERE p."subjectId" = 'SUBJECT_ID_HERE'
  AND p."frameworkId" = 'FRAMEWORK_ID_HERE'
ORDER BY p."sortOrder";

-- ============================================================================
-- SOLUTION: Grant Assessment Role
-- ============================================================================
-- If the teacher is missing the assessment role, run this:
-- Replace values as needed

-- First, get a framework ID:
-- SELECT id FROM "AssessmentFramework" WHERE "schoolId" = 'YOUR_SCHOOL_ID' ORDER BY "createdAt" DESC LIMIT 1;

-- Then insert the assessment role:
/*
INSERT INTO "AssessmentRole" (
  id,
  role,
  "teacherId",
  "subjectId",
  "frameworkId",
  "schoolId",
  "createdAt",
  "updatedAt"
)
VALUES (
  'ar_' || gen_random_uuid()::text,
  'SUBJECT_TEACHER',
  'TEACHER_ID_HERE',
  'MATHEMATICS_SUBJECT_ID_HERE',
  'FRAMEWORK_ID_HERE',
  'SCHOOL_ID_HERE',
  NOW(),
  NOW()
);
*/

-- OR add timetable assignment:
/*
INSERT INTO "ClassSubjectTeacher" (
  id,
  "teacherId",
  "subjectId",
  "classId",
  "createdAt",
  "updatedAt"
)
VALUES (
  'cst_' || gen_random_uuid()::text,
  'TEACHER_ID_HERE',
  'MATHEMATICS_SUBJECT_ID_HERE',
  'CLASS_ID_HERE',
  NOW(),
  NOW()
);
*/
