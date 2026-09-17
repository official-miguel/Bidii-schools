-- Parent accounts have no email address: parents sign in with their phone
-- number, matched against Parent.phone. A synthetic
-- "parent_<phone>@bidii.internal" address was minted purely to satisfy the
-- NOT NULL constraint, and then leaked into the parent portal as the account
-- holder's display name.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Clear the synthetic addresses already on file. The unique index is on
-- (schoolId, email) and Postgres treats NULLs as distinct, so several parents
-- in one school can hold a null without colliding.
UPDATE "User"
SET "email" = NULL
WHERE "role" = 'PARENT'
  AND "email" LIKE 'parent\_%@bidii.internal';
