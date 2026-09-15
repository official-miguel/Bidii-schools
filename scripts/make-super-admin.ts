/**
 * Script to grant SUPER_ADMIN role to a user
 * 
 * Usage:
 *   npx tsx scripts/make-super-admin.ts your-email@example.com
 */

import { prisma } from "../src/lib/prisma";

async function makeSuperAdmin(email: string) {
  try {
    // Find user by email (search across all schools since SUPER_ADMIN is global)
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, email: true, role: true, schoolId: true },
    });

    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`Found user: ${user.email}`);
    console.log(`Current role: ${user.role}`);

    if (user.role === "SUPER_ADMIN") {
      console.log(`✅ User already has SUPER_ADMIN role`);
      process.exit(0);
    }

    // Update to SUPER_ADMIN (SUPER_ADMIN accounts should have null schoolId)
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        role: "SUPER_ADMIN",
        schoolId: null, // SUPER_ADMIN is not scoped to any school
      },
    });

    console.log(`✅ Successfully granted SUPER_ADMIN role to ${user.email}`);
    console.log(`   Previous role: ${user.role} → New role: SUPER_ADMIN`);
    console.log(`\n💡 Please log out and log back in for changes to take effect.`);

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Get email from command line
const email = process.argv[2];

if (!email) {
  console.error("Usage: npx tsx scripts/make-super-admin.ts your-email@example.com");
  process.exit(1);
}

makeSuperAdmin(email);
