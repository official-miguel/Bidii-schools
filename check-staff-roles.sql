-- Check which staff roles are assigned to the current user
-- Run this in Supabase SQL Editor to verify role assignments

-- First, check all staff roles in the system
SELECT id, name, "schoolId" 
FROM "StaffRole" 
ORDER BY name;

-- Then check user-to-staff-role assignments
-- Replace 'your-email@example.com' with the actual email of the logged-in user
SELECT 
  u.email,
  u.role as base_role,
  sr.name as assigned_staff_role,
  usr."userId",
  usr."staffRoleId"
FROM "User" u
LEFT JOIN "UserStaffRole" usr ON usr."userId" = u.id
LEFT JOIN "StaffRole" sr ON sr.id = usr."staffRoleId"
WHERE u.email = 'your-email@example.com';

-- If the user doesn't have any staff roles assigned, you can assign one like this:
-- (Replace the IDs with actual values from your database)
/*
INSERT INTO "UserStaffRole" ("userId", "staffRoleId")
VALUES ('user-id-here', 'staff-role-id-here');
*/
