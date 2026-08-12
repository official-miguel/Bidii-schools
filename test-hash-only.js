/**
 * Test if the hash in the database matches our password
 */

const bcrypt = require('bcryptjs');

// The hash that's currently in the database (fetched via REST API)
const hashInDB = '$2b$12$lmh9q./GHAWWkH8TvWPYge5RgbuXjtLdZ2grQy1McoQr2iPUKOLc6';
const password = 'Bidii@2026';

console.log('Testing password against database hash...\n');
console.log('Password:', password);
console.log('Hash:', hashInDB);
console.log('');

bcrypt.compare(password, hashInDB, (err, result) => {
  if (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
  
  if (result) {
    console.log('✅ PASSWORD MATCHES!');
    console.log('\nThe hash in the database is correct.');
    console.log('The login failure must be caused by something else.');
    console.log('\nPossible issues:');
    console.log('1. Check if you\'re typing the email exactly: bidiisoftwares.1.ke@gmail.com');
    console.log('2. Check if you\'re typing the password exactly: Bidii@2026');
    console.log('3. Check browser console for JavaScript errors');
    console.log('4. Try clearing cookies and cache');
  } else {
    console.log('❌ PASSWORD DOES NOT MATCH!');
    console.log('\nThe hash in the database is wrong.');
  }
});
