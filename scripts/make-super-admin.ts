/**
 * Script to grant SUPER_ADMIN role to a user
 * 
 * Usage:
 *   npx tsx scripts/make-super-admin.ts your-email@example.com
 */

import { prisma } from "../src/lib/prisma";

async function makeSuperAdmin(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`Found user: ${user.name} (${user.email})`);
    console.log(`Current role: ${user.role}`);

    if (user.role === "SUPER_ADMIN") {
      console.log(`✅ User already has SUPER_ADMIN role`);
      process.exit(0);
    }

    // Update to SUPER_ADMIN
    await prisma.user.update({
      where: { email },
      data: { role: "SUPER_ADMIN" },
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
