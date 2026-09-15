/**
 * Diagnostic script to debug "Couldn't save marks" error
 * 
 * Run this script with: node debug-marksheet-save.js
 * 
 * This will check:
 * 1. User authentication and role
 * 2. Subject assignment for the teacher
 * 3. Assessment roles
 * 4. Period, class, and subject data
 * 5. Paper configuration
 */

// You'll need to provide these values from the browser when the error occurs:
const DEBUG_CONFIG = {
  // Get these from the URL when you see the error:
  // https://app.bidiischools.co.ke/teacher/assessments/marksheet?classId=...&subjectId=...&periodId=...
  classId: 'cmsvld6ou002o10dm...',  // Replace with actual classId from URL
  subjectId: 'cmtecqoax0001s...',   // Replace with actual subjectId from URL
  periodId: '10dm5tq2z30...',       // Replace with actual periodId from URL
  
  // Get this from browser console:
  // Open DevTools (F12) > Console tab > Type: document.cookie
  // Copy the value after 'next-auth.session-token='
  sessionToken: 'your-session-token-here',
};

console.log('🔍 Bidii Marksheet Save Diagnostic Tool\n');
console.log('Configuration:');
console.log('  Class ID:', DEBUG_CONFIG.classId);
console.log('  Subject ID:', DEBUG_CONFIG.subjectId);
console.log('  Period ID:', DEBUG_CONFIG.periodId);
console.log('\n' + '='.repeat(60) + '\n');

async function diagnose() {
  try {
    const baseUrl = 'https://app.bidiischools.co.ke';
    
    // Test 1: Check marksheet data load
    console.log('📊 Test 1: Checking marksheet data access...');
    const marksheetUrl = `${baseUrl}/api/assessments/marksheet?classId=${DEBUG_CONFIG.classId}&subjectId=${DEBUG_CONFIG.subjectId}&periodId=${DEBUG_CONFIG.periodId}`;
    
    const response = await fetch(marksheetUrl, {
      headers: {
        'Cookie': `next-auth.session-token=${DEBUG_CONFIG.sessionToken}`,
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Failed to load marksheet data');
      console.error('   Status:', response.status);
      console.error('   Error:', errorData.error || 'Unknown error');
      
      if (response.status === 403) {
        console.error('\n💡 This is a PERMISSION issue. The user does not have access to enter marks for this subject.');
        console.error('   Possible solutions:');
        console.error('   1. Check if the user is assigned to teach this subject in the timetable');
        console.error('   2. Check if the user has an Assessment Role for this subject');
        console.error('   3. Verify the user is set as class teacher if needed');
      }
      return;
    }
    
    const marksheetData = await response.json();
    console.log('✅ Marksheet data loaded successfully');
    console.log('   Period:', marksheetData.period?.name);
    console.log('   Subject:', marksheetData.subject?.name);
    console.log('   Class:', marksheetData.schoolClass?.name);
    console.log('   Papers:', marksheetData.papers?.length || 0);
    console.log('   Students:', marksheetData.rows?.length || 0);
    
    if (marksheetData.papers?.length === 0) {
      console.warn('\n⚠️  WARNING: No papers found for this subject/period combination');
      console.warn('   You need to add papers before you can enter marks');
      return;
    }
    
    // Test 2: Try a dummy save to see the actual error
    console.log('\n📝 Test 2: Attempting a test save...');
    const firstStudent = marksheetData.rows?.[0]?.student;
    const firstPaper = marksheetData.papers?.[0];
    
    if (!firstStudent || !firstPaper) {
      console.error('❌ No students or papers available for testing');
      return;
    }
    
    const testSaveUrl = `${baseUrl}/api/assessments/marksheet/batch`;
    const testPayload = {
      subjectId: DEBUG_CONFIG.subjectId,
      items: [{
        periodId: DEBUG_CONFIG.periodId,
        studentId: firstStudent.id,
        paperId: firstPaper.id,
        score: 50, // Test score
      }],
    };
    
    const saveResponse = await fetch(testSaveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `next-auth.session-token=${DEBUG_CONFIG.sessionToken}`,
      },
      body: JSON.stringify(testPayload),
    });
    
    const saveResult = await saveResponse.json();
    
    if (!saveResponse.ok) {
      console.error('❌ Save failed');
      console.error('   Status:', saveResponse.status);
      console.error('   Error:', saveResult.error || 'Unknown error');
      
      if (saveResponse.status === 403) {
        console.error('\n💡 PERMISSION DENIED:');
        console.error('   The user (Felix Njeri) cannot enter marks for this subject.');
        console.error('\n   Troubleshooting steps:');
        console.error('   1. Go to Settings > Staff > Find Felix Njeri');
        console.error('   2. Check "Assessment Roles" section');
        console.error('   3. Ensure she has "Subject Teacher" role for Mathematics (M&T)');
        console.error('   4. OR check Timetable > ensure she is assigned to teach this subject');
      } else if (saveResponse.status === 422) {
        console.error('\n💡 VALIDATION ERROR:');
        console.error('   Details:', saveResult.items);
      }
    } else {
      console.log('✅ Test save successful!');
      console.log('   This means the system is working correctly.');
      console.log('   The error might be caused by:');
      console.log('   - Invalid score values (negative, above max, or non-numeric)');
      console.log('   - Network connectivity issues');
      console.log('   - Browser cache problems');
    }
    
  } catch (error) {
    console.error('❌ Diagnostic failed with error:');
    console.error(error);
  }
}

console.log('⚠️  SETUP REQUIRED:\n');
console.log('Before running this script, you need to:');
console.log('1. Open the marksheet page where you see the error');
console.log('2. Copy the classId, subjectId, and periodId from the URL');
console.log('3. Open browser DevTools (F12) > Console');
console.log('4. Type: document.cookie');
console.log('5. Copy your session token');
console.log('6. Edit this file and paste the values into DEBUG_CONFIG\n');
console.log('Then run: node debug-marksheet-save.js\n');

// Uncomment this line after configuring DEBUG_CONFIG:
// diagnose();
