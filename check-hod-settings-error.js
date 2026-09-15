/**
 * Diagnostic script to check why the HOD settings page is failing
 * Run with: node check-hod-settings-error.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Checking HOD Settings Page Requirements...\n');

  try {
    // Test 1: Check if AssessmentFramework table exists and can be queried
    console.log('Test 1: Checking AssessmentFramework table...');
    const frameworks = await prisma.assessmentFramework.findMany({
      take: 1,
      select: { id: true, type: true, label: true }
    });
    console.log(`✅ AssessmentFramework table exists. Found ${frameworks.length} framework(s)\n`);
  } catch (error) {
    console.error('❌ AssessmentFramework query failed:');
    console.error(error.message);
    console.error('\nThis is likely the cause of the page error!\n');
    return;
  }

  try {
    // Test 2: Check if DepartmentFormulaConfig table exists
    console.log('Test 2: Checking DepartmentFormulaConfig table...');
    const formulas = await prisma.departmentFormulaConfig.findMany({
      take: 1,
      select: { id: true }
    });
    console.log(`✅ DepartmentFormulaConfig table exists. Found ${formulas.length} formula(s)\n`);
  } catch (error) {
    console.log('⚠️  DepartmentFormulaConfig table does not exist yet (this is OK - page handles it)');
    console.log('    You may need to run: npx prisma db push\n');
  }

  try {
    // Test 3: Check Department table
    console.log('Test 3: Checking Department table...');
    const depts = await prisma.department.findMany({
      take: 1,
      select: { id: true, name: true }
    });
    console.log(`✅ Department table exists. Found ${depts.length} department(s)\n`);
  } catch (error) {
    console.error('❌ Department query failed:');
    console.error(error.message + '\n');
    return;
  }

  try {
    // Test 4: Check Subject table
    console.log('Test 4: Checking Subject table...');
    const subjects = await prisma.subject.findMany({
      take: 1,
      select: { id: true, name: true }
    });
    console.log(`✅ Subject table exists. Found ${subjects.length} subject(s)\n`);
  } catch (error) {
    console.error('❌ Subject query failed:');
    console.error(error.message + '\n');
    return;
  }

  try {
    // Test 5: Check SchoolClass table (for form numbers)
    console.log('Test 5: Checking SchoolClass table...');
    const classes = await prisma.schoolClass.findMany({
      take: 1,
      select: { id: true, form: true, name: true }
    });
    console.log(`✅ SchoolClass table exists. Found ${classes.length} class(es)\n`);
  } catch (error) {
    console.error('❌ SchoolClass query failed:');
    console.error(error.message + '\n');
    return;
  }

  console.log('✨ All required tables exist and are queryable!');
  console.log('\nThe error might be caused by:');
  console.log('1. A specific data condition (e.g., a null value where not expected)');
  console.log('2. A runtime error in the component rendering');
  console.log('3. An authentication/authorization issue');
  console.log('\nTo see the actual error message:');
  console.log('- Check the browser console for client-side errors');
  console.log('- Check the terminal where "npm run dev" is running for server errors');
}

main()
  .catch((e) => {
    console.error('❌ Fatal error:');
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
