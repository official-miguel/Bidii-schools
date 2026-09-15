-- Quick check: Felix Njeri's permissions for Mathematics M&T
-- Run this to see if Felix has the right permissions

-- Step 1: Find Felix's account
SELECT 
  'Felix User Info' as check_type,
  u.id as user_id,
  u.email,
  u."fullName",
  u.role as user_role,
  t.id as teacher_id
FROM "User" u
LEFT JOIN "Teacher" t ON t."userId" = u.id
WHERE u."fullName" ILIKE '%Felix%Njeri%'
   OR u.email ILIKE '%felix%njeri%';

-- Step 2: Find Math M&T subject
SELECT 
  'Math M&T Subject' as check_type,
  id as subject_id,
  name,
  code,
  "schoolId"
FROM "Subject"
WHERE (name ILIKE '%math%' AND (code = 'M&T' OR name ILIKE '%M&T%'))
   OR code = 'M&T'
   OR name = 'Mathematics (M&T)';

-- Step 3: Check Felix's Assessment Roles
-- Replace TEACHER_ID with the teacher_id from Step 1
SELECT 
  'Assessment Roles' as check_type,
  ar.id,
  ar.role,
  ar."subjectId",
  s.name as subject_name,
  s.code as subject_code
FROM "AssessmentRole" ar
LEFT JOIN "Subject" s ON s.id = ar."subjectId"
WHERE ar."teacherId" = 'REPLACE_WITH_TEACHER_ID_FROM_STEP_1';

-- Step 4: Check Felix's Timetable Assignments
-- Replace TEACHER_ID with the teacher_id from Step 1
SELECT 
  'Timetable Assignments (ClassSubjectTeacher)' as check_type,
  cst."subjectId",
  s.name as subject_name,
  s.code as subject_code,
  sc.name as class_name
FROM "ClassSubjectTeacher" cst
JOIN "Subject" s ON s.id = cst."subjectId"
JOIN "SchoolClass" sc ON sc.id = cst."classId"
WHERE cst."teacherId" = 'REPLACE_WITH_TEACHER_ID_FROM_STEP_1';

-- Step 5: Check Elective Group Assignments
SELECT 
  'Elective Group Assignments' as check_type,
  cegt."subjectId",
  s.name as subject_name,
  s.code as subject_code,
  ceg.name as group_name
FROM "ClassElectiveGroupTeacher" cegt
JOIN "Subject" s ON s.id = cegt."subjectId"
JOIN "ClassElectiveGroup" ceg ON ceg.id = cegt."classElectiveGroupId"
WHERE cegt."teacherId" = 'REPLACE_WITH_TEACHER_ID_FROM_STEP_1';

-- Step 6: Check if Felix is a Class Teacher
SELECT 
  'Class Teacher Status' as check_type,
  sc.id as class_id,
  sc.name as class_name,
  sc."classTeacherId"
FROM "SchoolClass" sc
JOIN "Teacher" t ON t.id = sc."classTeacherId"
JOIN "User" u ON u.id = t."userId"
WHERE u."fullName" ILIKE '%Felix%Njeri%';

-- ==================================================================
-- QUICK FIX: If Felix needs Math M&T access, run ONE of these:
-- ==================================================================

-- Option A: Add Assessment Role (Recommended)
-- First get IDs from steps above, then:
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
SELECT 
  'ar_felix_math_' || substring(md5(random()::text) from 1 for 12),
  'SUBJECT_TEACHER',
  t.id,  -- Felix's teacher ID
  s.id,  -- Math M&T subject ID
  (SELECT id FROM "AssessmentFramework" WHERE "schoolId" = s."schoolId" ORDER BY "createdAt" DESC LIMIT 1),
  s."schoolId",
  NOW(),
  NOW()
FROM "Teacher" t
JOIN "User" u ON u.id = t."userId"
CROSS JOIN "Subject" s
WHERE u."fullName" ILIKE '%Felix%Njeri%'
  AND s.name ILIKE '%math%'
  AND (s.code = 'M&T' OR s.name ILIKE '%M&T%');
*/

-- Option B: Add Timetable Assignment
-- This requires knowing the class ID for Form 4 East
/*
INSERT INTO "ClassSubjectTeacher" (
  id,
  "teacherId",
  "subjectId",
  "classId",
  "createdAt",
  "updatedAt"
)
SELECT 
  'cst_felix_math_' || substring(md5(random()::text) from 1 for 12),
  t.id,  -- Felix's teacher ID
  s.id,  -- Math M&T subject ID
  sc.id, -- Form 4 East class ID
  NOW(),
  NOW()
FROM "Teacher" t
JOIN "User" u ON u.id = t."userId"
CROSS JOIN "Subject" s
CROSS JOIN "SchoolClass" sc
WHERE u."fullName" ILIKE '%Felix%Njeri%'
  AND s.name ILIKE '%math%'
  AND (s.code = 'M&T' OR s.name ILIKE '%M&T%')
  AND sc.name = 'Form 4 East';
*/
