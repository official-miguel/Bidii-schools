/**
 * Check super admin via Supabase REST API
 * Run with: node check-super-admin-rest.js
 */

const fetch = require('node-fetch');

const SUPABASE_URL = 'https://qakretnjeuhihodkrctq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFha3JldG5qZXVoaWhvZGtyY3RxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM3NjYyNCwiZXhwIjoyMTAxOTUyNjI0fQ.Py49YAdhgmOInXPCuXNCKVZvFRKzhJ9Jq2Yf3pq8CxU';

async function checkSuperAdmin() {
  console.log('🔍 Checking Super Admin User via REST API\n');
  
  try {
    // Query for all SUPER_ADMIN users
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/User?role=eq.SUPER_ADMIN&select=id,email,role,isActive,passwordHash,mustChangePassword`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error('❌ API Error:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }

    const users = await response.json();
    
    console.log('📊 Found', users.length, 'SUPER_ADMIN user(s):\n');
    
    users.forEach((user, i) => {
      console.log(`User ${i + 1}:`);
      console.log('  ID:', user.id);
      console.log('  Email:', user.email);
      console.log('  Role:', user.role);
      console.log('  Is Active:', user.isActive);
      console.log('  Has Password:', !!user.passwordHash);
      if (user.passwordHash) {
        console.log('  Hash (first 30 chars):', user.passwordHash.substring(0, 30) + '...');
      }
      console.log('  Must Change Password:', user.mustChangePassword);
      console.log('');
    });

    if (users.length === 0) {
      console.log('❌ No SUPER_ADMIN users found in the database!');
      console.log('\nYou need to create one with this SQL in Supabase SQL Editor:\n');
      console.log(`INSERT INTO "User" (id, email, "passwordHash", role, "isActive", "mustChangePassword", "schoolId")`);
      console.log(`VALUES ('super_admin_bidii', 'bidiisoftwares.1.ke@gmail.com', '$2b$12$lmh9q./GHAWWkH8TvWPYge5RgbuXjtLdZ2grQy1McoQr2iPUKOLc6', 'SUPER_ADMIN', true, false, NULL);`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  }
}

checkSuperAdmin();
