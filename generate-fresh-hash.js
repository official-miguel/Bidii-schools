/**
 * Generate a fresh bcrypt hash for the super admin password
 * Run with: node generate-fresh-hash.js
 */

const bcrypt = require('bcryptjs');

const password = 'Bidii@2026';

console.log('Generating fresh bcrypt hash...\n');
console.log('Password:', JSON.stringify(password));
console.log('Password length:', password.length);
console.log('Password bytes:', Buffer.from(password).toString('hex'));
console.log('');

// Generate 3 different hashes to verify consistency
const promises = [
  bcrypt.hash(password, 12),
  bcrypt.hash(password, 12),
  bcrypt.hash(password, 12)
];

Promise.all(promises).then(hashes => {
  console.log('Generated 3 fresh hashes:\n');
  hashes.forEach((hash, i) => {
    console.log(`Hash ${i + 1}:`);
    console.log(hash);
    console.log('');
  });
  
  console.log('Testing each hash against the password...\n');
  
  Promise.all(hashes.map(hash => bcrypt.compare(password, hash))).then(results => {
    results.forEach((result, i) => {
      console.log(`Hash ${i + 1}: ${result ? '✅ VALID' : '❌ INVALID'}`);
    });
    
    console.log('\n📋 Use any of the hashes above in your SQL UPDATE statement.');
  });
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
