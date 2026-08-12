/**
 * Test super admin login - simulates the exact flow
 * Run with: node test-super-admin-login.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testLogin() {
  const identifier = 'bidiisoftwares.1.ke@gmail.com';
  const password = 'Bidii@2026';
  
  console.log('🔍 Testing Super Admin Login\n');
  console.log('Email:', identifier);
  console.log('Password:', password);
  console.log('');

  try {
    // Query exactly as the login route does
    const rows = await prisma.$queryRaw`
      SELECT
        id, email, "passwordHash", role::text AS role,
        "mustChangePassword", "isActive", "schoolId",
        "staffRoleId", "createdAt", "updatedAt",
        "avatarUrl", "avatarStoragePath"
      FROM "User"
      WHERE email = ${identifier}
        AND role::text = 'SUPER_ADMIN'
        AND "isActive" = true
      LIMIT 1
    `;

    console.log('📊 Query Results:\n');
    console.log('Rows found:', rows.length);
    
    if (rows.length === 0) {
      console.log('\n❌ No SUPER_ADMIN user found with that email!');
      console.log('\nLet me check what super admin users exist...\n');
      
      const allSuperAdmins = await prisma.$queryRaw`
        SELECT
          id, email, role::text AS role, "isActive"
        FROM "User"
        WHERE role::text = 'SUPER_ADMIN'
      `;
      
      console.log('All SUPER_ADMIN users:');
      console.log(JSON.stringify(allSuperAdmins, null, 2));
      return;
    }

    const user = rows[0];
    console.log('User ID:', user.id);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Is Active:', user.isActive);
    console.log('Has Password Hash:', !!user.passwordHash);
    console.log('');

    if (!user.passwordHash) {
      console.log('❌ No password hash set for this user!');
      return;
    }

    console.log('Hash (first 40 chars):', user.passwordHash.substring(0, 40) + '...');
    console.log('');

    console.log('🔐 Testing password verification...\n');
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    
    if (isValid) {
      console.log('✅ PASSWORD VERIFICATION SUCCESSFUL!');
      console.log('\nThe login should work. If it still fails, check:');
      console.log('1. Browser cookies are enabled');
      console.log('2. No typos in the email/password on the login form');
      console.log('3. Check browser console for other errors');
    } else {
      console.log('❌ PASSWORD VERIFICATION FAILED!');
      console.log('\nThe hash in the database does not match the password.');
      console.log('Run this SQL to update it:\n');
      
      const newHash = await bcrypt.hash(password, 12);
      console.log(`UPDATE "User"`);
      console.log(`SET "passwordHash" = '${newHash}'`);
      console.log(`WHERE id = '${user.id}';`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

testLogin();
