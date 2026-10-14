-- When a super admin's password was first confirmed by the Trillionaire Designs app.
ALTER TABLE "User" ADD COLUMN "passwordFromTdAt" TIMESTAMP(3);
