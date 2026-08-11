const https = require('http');

async function testEndpoint(url, timeoutMs = 30000) {
  const start = Date.now();
  
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const end = Date.now();
        const duration = end - start;
        
        resolve({
          status: res.statusCode,
          duration: duration,
          contentLength: data.length,
          success: res.statusCode >= 200 && res.statusCode < 300
        });
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.end();
  });
}

async function runTest() {
  console.log('Testing /api/accommodation/summary endpoint...');
  
  try {
    const result = await testEndpoint('http://localhost:3000/api/accommodation/summary');
    
    console.log(`✅ Success! Response received in ${result.duration}ms`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Content Length: ${result.contentLength} bytes`);
    
    if (result.duration > 5000) {
      console.log(`⚠️  Slow response (>${result.duration/1000}s)`);
    } else if (result.duration > 2000) {
      console.log(`⚡ Moderate response time (${result.duration/1000}s)`);
    } else {
      console.log(`🚀 Fast response time (${result.duration/1000}s)`);
    }
    
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
  }
}

runTest();