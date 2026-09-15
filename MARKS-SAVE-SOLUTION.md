# Solution: Can't Save Marks Issue

## What I Did

Since you mentioned Felix **should** have permission because he teaches those subjects, I've enhanced the error reporting throughout the system to show **exactly** what's going wrong, rather than just showing "Couldn't save marks."

## Changes Made

### 1. Enhanced Frontend Error Reporting
**File:** `src/components/assessment/MarksheetGrid.tsx`

- ✅ Added detailed console logging when save fails
- ✅ Shows HTTP status code, error details, and the payload being sent
- ✅ Better error messages for users:
  - Permission errors: "Permission denied. You may not have access to enter marks for this subject."
  - Validation errors: Shows specific validation issues (e.g., "Score 110 is out of range (max 100)")
  - Generic errors: Shows the actual error message from the server

### 2. Enhanced Backend Error Reporting
**File:** `src/app/api/assessments/marksheet/batch/route.ts`

- ✅ Logs detailed permission information when access is denied:
  - User ID, email, and role
  - Teacher ID and assigned subjects
  - Assessment roles
  - Whether they're a principal or class teacher
- ✅ Added database error handling with detailed logging
- ✅ Better error messages returned to the frontend

### 3. Success Logging
Both frontend and backend now log successful saves so you can confirm when things work.

## How To Diagnose The Issue Now

### Quick Steps:

1. **Open the page** where marks won't save
2. **Open browser console** (Press F12, click Console tab)
3. **Try saving marks**
4. **Read the error message** - it will tell you exactly what's wrong

### What You'll See:

#### Scenario A: Permission Issue (Most Likely)
```
❌ Permission denied for marks entry:
{
  userEmail: "felix@school.com",
  subjectId: "cm....",
  teacherId: "...",
  roles: [],
  assignedSubjectIds: ["subject1", "subject2"],
  classTeacherOfId: null
}
```

**This tells you:**
- Felix's email and teacher ID
- The subject they're trying to access
- What roles they have (empty if none)
- **What subjects they ARE assigned to** ← Compare this with the subject they're trying to save
- Whether they're a class teacher

**Solution:** 
- If `assignedSubjectIds` doesn't include the Math M&T subject ID, Felix isn't assigned to teach it
- Use the SQL scripts below to add the assignment

#### Scenario B: Validation Error
```
❌ Failed to save marks:
{
  status: 422,
  error: "VALIDATION_ERROR",
  details: [
    { index: 0, message: "Score 110 is out of range (max 100)" }
  ]
}
```

**Solution:** Fix the invalid mark values

#### Scenario C: Database Error
```
❌ Database error while saving marks:
{
  error: ...,
  message: "...",
  subjectId: "...",
  itemCount: 5
}
```

**Solution:** Check server logs for database issues

## SQL Diagnostic Scripts

I've created two SQL files to help:

### 1. `check-felix-permissions.sql`
Quick script to check Felix's current permissions. Just run it and it will show:
- Felix's user and teacher IDs
- Math M&T subject ID
- Felix's assessment roles
- Felix's timetable assignments
- If Felix is a class teacher

It also includes ready-to-run INSERT statements to add the missing permission.

### 2. `check-marksheet-permissions.sql`
More comprehensive diagnostic queries for any permission issues.

## Quick Fix SQL

If Felix should have access but doesn't, run this (after getting the IDs from the diagnostic queries):

```sql
-- Add Assessment Role for Felix to teach Math M&T
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
  'ar_' || substring(md5(random()::text) from 1 for 20),
  'SUBJECT_TEACHER',
  'FELIX_TEACHER_ID_HERE',
  'MATH_MT_SUBJECT_ID_HERE',
  'FRAMEWORK_ID_HERE',
  'SCHOOL_ID_HERE',
  NOW(),
  NOW()
);
```

OR add a timetable assignment:

```sql
-- Add Timetable Assignment
INSERT INTO "ClassSubjectTeacher" (
  id,
  "teacherId",
  "subjectId",
  "classId",
  "createdAt",
  "updatedAt"
)
VALUES (
  'cst_' || substring(md5(random()::text) from 1 for 20),
  'FELIX_TEACHER_ID_HERE',
  'MATH_MT_SUBJECT_ID_HERE',
  'FORM_4_EAST_CLASS_ID_HERE',
  NOW(),
  NOW()
);
```

## Testing

After applying any fix:

1. **Refresh the page** (F5)
2. Keep the console open (F12)
3. Try saving marks again
4. You should see: `✅ Marks saved successfully`

## Why This Happens

The system checks permissions in this order:

1. Is the user an admin with assessment management permission?
2. Is the user a principal?
3. Does the user have a DIRECTOR or EXAM_OFFICER role?
4. Is the user a class teacher?
5. Does the user have a SUBJECT_TEACHER assessment role for this subject?
6. **Is the user assigned to teach this subject in the timetable?** ← This is the fallback

If ALL of these are false, the save is blocked.

**Most common issue:** The teacher teaches the subject in reality, but there's no:
- Assessment Role record in the database, OR
- Timetable assignment (ClassSubjectTeacher) record

## Files Created

1. **QUICK-FIX-MARKS.md** - Simple step-by-step guide
2. **check-felix-permissions.sql** - Quick permission check for Felix
3. **check-marksheet-permissions.sql** - General permission diagnostics
4. **MARKSHEET-SAVE-FIX.md** - Original comprehensive troubleshooting guide

## Next Actions

1. **Try saving marks now** with console open (F12)
2. **Share the console output** with me
3. I can then tell you exactly which record is missing and provide the exact SQL to fix it

The enhanced logging will make it crystal clear what's happening!
