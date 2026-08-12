/**
 * Verify password hash script
 * Run with: node verify-password.js
 */

const bcrypt = require('bcryptjs');

const password = 'Bidii@2026';
const hash = '$2b$12$NUTTGAwthJ0RjMDRQKAbWO.RBuiSvLAS2rAkVmgVNd1IR8z2IXHF.';

console.log('Testing password verification...\n');
console.log('Password:', password);
console.log('Hash:', hash);
console.log('');

bcrypt.compare(password, hash, (err, result) => {
  if (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
  
  if (result) {
    console.log('✅ Password verification SUCCESS');
    console.log('The hash matches the password correctly.');
  } else {
    console.log('❌ Password verification FAILED');
    console.log('The hash does not match the password.');
  }
  
  process.exit(result ? 0 : 1);
});
