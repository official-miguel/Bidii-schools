# Fix: "Couldn't save marks" Error

## Problem
When trying to save marks in the Mark Sheets section, you're getting a "Couldn't save marks" error. This is shown as a red error banner on the screen.

## Root Causes
Based on the code analysis, this error can occur due to:

1. **Permission Issues (Most Common)** - The teacher doesn't have proper authorization to enter marks for this subject
2. **Validation Errors** - Invalid score values (negative numbers, exceeding max marks, or non-numeric values)
3. **Missing Data** - Period, papers, or student records are missing or misconfigured
4. **Network Issues** - Connection problems or server errors

## Quick Diagnosis

### Method 1: Check Browser Console (Fastest)
1. Open the marksheet page where the error occurs
2. Press `F12` to open Developer Tools
3. Click the **Console** tab
4. Try to save marks again
5. Look for error messages in red

**What to look for:**
- `403 Forbidden` = Permission issue (see Solution A)
- `422 Unprocessable Entity` = Validation error (see Solution B)
- `404 Not Found` = Missing data (see Solution C)
- `500 Internal Server Error` = Server error (see Solution D)

### Method 2: Check Network Tab
1. Press `F12` to open Developer Tools
2. Click the **Network** tab
3. Click "Save marks" button
4. Find the request to `/api/assessments/marksheet/batch`
5. Click it and view the **Response** tab

## Solutions

### Solution A: Permission Issue (403 Forbidden)

The teacher (Felix Njeri in your screenshot) doesn't have permission to enter marks for this subject. This is the **most likely cause**.

#### Fix Option 1: Assign via Assessment Roles (Recommended)

1. **Via Database** (if you have SQL access):
   ```sql
   -- Step 1: Find the teacher's ID
   SELECT t.id, u.email, u."fullName"
   FROM "Teacher" t
   JOIN "User" u ON u.id = t."userId"
   WHERE u."fullName" ILIKE '%Felix%Njeri%';
   
   -- Step 2: Find the subject ID for Mathematics (M&T)
   SELECT id, name, code
   FROM "Subject"
   WHERE name ILIKE '%math%' AND code = 'M&T';
   
   -- Step 3: Get the current framework ID
   SELECT id, name
   FROM "AssessmentFramework"
   WHERE "schoolId" = 'YOUR_SCHOOL_ID'
   ORDER BY "createdAt" DESC
   LIMIT 1;
   
   -- Step 4: Create the assessment role
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
     'TEACHER_ID_FROM_STEP_1',
     'SUBJECT_ID_FROM_STEP_2',
     'FRAMEWORK_ID_FROM_STEP_3',
     'YOUR_SCHOOL_ID',
     NOW(),
     NOW()
   );
   ```

2. **Via Application** (if there's a UI for it):
   - Go to **Settings** > **Staff Management**
   - Find **Felix Njeri**
   - Look for **Assessment Roles** section
   - Add **Subject Teacher** role for **Mathematics (M&T)**

#### Fix Option 2: Assign via Timetable

The system also checks timetable assignments as a fallback. If the teacher is assigned to teach the subject in the timetable, they can enter marks.

```sql
-- Add timetable assignment
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
  'TEACHER_ID_HERE',
  'SUBJECT_ID_HERE',
  'CLASS_ID_HERE',
  NOW(),
  NOW()
);
```

### Solution B: Validation Error (422)

If the error is a validation issue, check:

1. **Score out of range**: Ensure all marks are between 0 and the maximum marks for that paper
2. **Invalid characters**: Only numbers are allowed (no letters or symbols)
3. **Decimal places**: Check if the system allows decimals or only whole numbers

**Example validation errors:**
- Score 52 when max marks is 50 → Invalid
- Score -5 → Invalid (negative)
- Score "AB" → Invalid (non-numeric)

**Fix:**
- Review all the marks you entered
- Ensure they're within the valid range (0 to max marks)
- Clear any invalid entries and re-enter

### Solution C: Missing Papers (No Papers Found)

If there are no papers configured for the subject:

1. Go to the **Mark Sheets** page
2. Select the class and subject
3. Look for an "Add Paper" or "Configure Papers" button
4. Add papers (e.g., "Paper 1", "Paper 2") with their maximum marks

**Via Database:**
```sql
-- Check if papers exist
SELECT p.id, p.name, p."maxMarks"
FROM "Paper" p
WHERE p."subjectId" = 'SUBJECT_ID_HERE'
  AND p."frameworkId" = 'FRAMEWORK_ID_HERE';

-- If none exist, create them
INSERT INTO "Paper" (
  id,
  name,
  "maxMarks",
  "sortOrder",
  "subjectId",
  "frameworkId",
  "schoolId",
  "createdAt",
  "updatedAt"
)
VALUES 
  (
    'paper_' || substring(md5(random()::text) from 1 for 20),
    'Paper 1',
    100,
    1,
    'SUBJECT_ID_HERE',
    'FRAMEWORK_ID_HERE',
    'SCHOOL_ID_HERE',
    NOW(),
    NOW()
  );
```

### Solution D: Server Error (500)

If you see a 500 error, check:

1. **Server logs**: Look in the application logs for error details
2. **Database connection**: Ensure the database is accessible
3. **Recent deployments**: If this started after a deployment, there might be a code issue

**Temporary workaround:**
- Refresh the page and try again
- Try a different browser
- Clear browser cache and cookies

## Testing the Fix

After applying any of the solutions above:

1. **Refresh the page** (press `F5`)
2. Try entering a mark again
3. Click **Save marks**
4. You should see a green checkmark ✓ confirming the save

## Diagnostic Tools Included

I've created two diagnostic tools for you:

### 1. `check-marksheet-permissions.sql`
Run these SQL queries to check:
- Teacher's user and role information
- Assessment role assignments
- Timetable subject assignments
- Paper configuration

### 2. `debug-marksheet-save.js`
A Node.js script to test the save functionality directly:
1. Configure it with the classId, subjectId, and periodId from the URL
2. Add your session token from browser cookies
3. Run: `node debug-marksheet-save.js`

## Prevention

To prevent this issue in the future:

1. **When adding new teachers**: Always assign their assessment roles or timetable subjects
2. **When creating new subjects**: Ensure papers are configured for each assessment period
3. **When creating new assessment periods**: Verify all subjects have the necessary papers

## Need More Help?

If none of these solutions work:

1. Check the **browser console** (F12 > Console tab) for specific error messages
2. Check the **server logs** for backend errors
3. Run the diagnostic SQL queries in `check-marksheet-permissions.sql`
4. Share the specific error message you see in the console

## Summary

**Most likely issue**: Felix Njeri doesn't have permission to enter marks for Mathematics (M&T).

**Quick fix**: Add an Assessment Role for her as "SUBJECT_TEACHER" for that subject, or ensure she's assigned to teach it in the timetable.
