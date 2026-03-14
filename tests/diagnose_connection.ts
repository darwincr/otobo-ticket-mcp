/**
 * OTOBO Connection Diagnostics
 * 
 * This script tests various connection scenarios to help identify
 * where ECONNRESET errors are originating from.
 */

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const OTOBO_URL = process.env.OTOBO_URL;
const OTOBO_USER = process.env.OTOBO_USER;
const OTOBO_PASSWORD = process.env.OTOBO_PASSWORD;

if (!OTOBO_URL || !OTOBO_USER || !OTOBO_PASSWORD) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const baseUrl = OTOBO_URL.replace(/\/$/, '');
const results: { test: string; status: string; details: string; duration?: number }[] = [];

// Parse URL to get host info
const urlObj = new URL(baseUrl);
const isHttps = urlObj.protocol === 'https:';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  OTOBO Connection Diagnostics');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Target: ${baseUrl}`);
console.log(`  Host: ${urlObj.hostname}`);
console.log(`  Port: ${urlObj.port || (isHttps ? 443 : 80)}`);
console.log(`  Protocol: ${urlObj.protocol}`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function makeRequest(client: AxiosInstance, operation: string, label: string): Promise<{ success: boolean; duration: number; error?: string }> {
  const start = Date.now();
  try {
    await client.post(`${baseUrl}/${operation}`, {
      UserLogin: OTOBO_USER,
      Password: OTOBO_PASSWORD,
      Valid: 1,
    });
    return { success: true, duration: Date.now() - start };
  } catch (error: any) {
    return { 
      success: false, 
      duration: Date.now() - start,
      error: `${error.code || 'UNKNOWN'}: ${error.message}`
    };
  }
}

async function test1_BasicConnectivity() {
  console.log('🔍 Test 1: Basic Connectivity');
  console.log('   Testing single request to QueueList...\n');
  
  const client = axios.create({
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  
  const result = await makeRequest(client, 'QueueList', 'Basic');
  
  if (result.success) {
    results.push({ test: 'Basic Connectivity', status: '✅ PASS', details: `Response in ${result.duration}ms`, duration: result.duration });
    console.log(`   ✅ Success - Response time: ${result.duration}ms\n`);
  } else {
    results.push({ test: 'Basic Connectivity', status: '❌ FAIL', details: result.error!, duration: result.duration });
    console.log(`   ❌ Failed - ${result.error}\n`);
  }
}

async function test2_KeepAlive() {
  console.log('🔍 Test 2: Keep-Alive Behavior');
  console.log('   Testing connection reuse with keep-alive enabled...\n');
  
  // Create agent with keep-alive
  const agent = isHttps 
    ? new https.Agent({ keepAlive: true, keepAliveMsecs: 1000 })
    : new http.Agent({ keepAlive: true, keepAliveMsecs: 1000 });
  
  const client = axios.create({
    headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
    timeout: 30000,
    httpAgent: isHttps ? undefined : agent,
    httpsAgent: isHttps ? agent : undefined,
  });
  
  const requests = ['QueueList', 'StateList', 'PriorityList'];
  let allSuccess = true;
  const times: number[] = [];
  
  for (const op of requests) {
    const result = await makeRequest(client, op, op);
    times.push(result.duration);
    if (!result.success) {
      allSuccess = false;
      console.log(`   ❌ ${op}: ${result.error}`);
    } else {
      console.log(`   ✅ ${op}: ${result.duration}ms`);
    }
  }
  
  agent.destroy();
  
  const avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  if (allSuccess) {
    results.push({ test: 'Keep-Alive', status: '✅ PASS', details: `Avg response: ${avgTime}ms`, duration: avgTime });
  } else {
    results.push({ test: 'Keep-Alive', status: '❌ FAIL', details: 'Connection dropped during keep-alive' });
  }
  console.log();
}

async function test3_NoKeepAlive() {
  console.log('🔍 Test 3: No Keep-Alive (Fresh Connections)');
  console.log('   Testing with Connection: close header...\n');
  
  const requests = ['QueueList', 'StateList', 'PriorityList'];
  let allSuccess = true;
  const times: number[] = [];
  
  for (const op of requests) {
    const client = axios.create({
      headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      timeout: 30000,
    });
    
    const result = await makeRequest(client, op, op);
    times.push(result.duration);
    if (!result.success) {
      allSuccess = false;
      console.log(`   ❌ ${op}: ${result.error}`);
    } else {
      console.log(`   ✅ ${op}: ${result.duration}ms`);
    }
  }
  
  const avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  if (allSuccess) {
    results.push({ test: 'No Keep-Alive', status: '✅ PASS', details: `Avg response: ${avgTime}ms`, duration: avgTime });
  } else {
    results.push({ test: 'No Keep-Alive', status: '❌ FAIL', details: 'Requests failed even with fresh connections' });
  }
  console.log();
}

async function test4_RapidRequests() {
  console.log('🔍 Test 4: Rapid Sequential Requests');
  console.log('   Testing 10 requests with no delay...\n');
  
  const client = axios.create({
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < 10; i++) {
    const result = await makeRequest(client, 'QueueList', `Request ${i + 1}`);
    if (result.success) {
      successCount++;
      process.stdout.write(`✅`);
    } else {
      failCount++;
      process.stdout.write(`❌`);
      if (!errors.includes(result.error!.split(':')[0])) {
        errors.push(result.error!.split(':')[0]);
      }
    }
  }
  console.log();
  
  if (failCount === 0) {
    results.push({ test: 'Rapid Requests', status: '✅ PASS', details: `${successCount}/10 succeeded` });
    console.log(`   ✅ All requests succeeded\n`);
  } else {
    results.push({ test: 'Rapid Requests', status: '⚠️ PARTIAL', details: `${successCount}/10 succeeded, errors: ${errors.join(', ')}` });
    console.log(`   ⚠️ ${failCount} failures - Errors: ${errors.join(', ')}\n`);
  }
}

async function test5_DelayedRequests() {
  console.log('🔍 Test 5: Requests with 500ms Delay');
  console.log('   Testing 5 requests with delay between each...\n');
  
  const client = axios.create({
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < 5; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 500));
    const result = await makeRequest(client, 'QueueList', `Request ${i + 1}`);
    if (result.success) {
      successCount++;
      process.stdout.write(`✅`);
    } else {
      failCount++;
      process.stdout.write(`❌`);
    }
  }
  console.log();
  
  if (failCount === 0) {
    results.push({ test: 'Delayed Requests', status: '✅ PASS', details: `${successCount}/5 succeeded` });
    console.log(`   ✅ All requests succeeded\n`);
  } else {
    results.push({ test: 'Delayed Requests', status: '⚠️ PARTIAL', details: `${successCount}/5 succeeded` });
    console.log(`   ⚠️ ${failCount} failures\n`);
  }
}

async function test6_IdleConnection() {
  console.log('🔍 Test 6: Idle Connection Test');
  console.log('   Making request, waiting 5s idle, then another request...\n');
  
  const agent = isHttps 
    ? new https.Agent({ keepAlive: true })
    : new http.Agent({ keepAlive: true });
  
  const client = axios.create({
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
    httpAgent: isHttps ? undefined : agent,
    httpsAgent: isHttps ? agent : undefined,
  });
  
  // First request
  const result1 = await makeRequest(client, 'QueueList', 'Before idle');
  console.log(`   Request 1: ${result1.success ? '✅' : '❌'} ${result1.duration}ms`);
  
  // Wait 5 seconds
  console.log('   Waiting 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  
  // Second request (reusing connection)
  const result2 = await makeRequest(client, 'QueueList', 'After idle');
  console.log(`   Request 2: ${result2.success ? '✅' : '❌'} ${result2.duration}ms ${result2.error || ''}`);
  
  agent.destroy();
  
  if (result1.success && result2.success) {
    results.push({ test: 'Idle Connection (5s)', status: '✅ PASS', details: 'Connection survived idle period' });
  } else if (result1.success && !result2.success) {
    results.push({ test: 'Idle Connection (5s)', status: '❌ FAIL', details: `Connection dropped after idle: ${result2.error}` });
    console.log('\n   ⚠️  Server or proxy is closing idle connections < 5s');
  } else {
    results.push({ test: 'Idle Connection (5s)', status: '❌ FAIL', details: 'Connection issues' });
  }
  console.log();
}

async function test7_ParallelRequests() {
  console.log('🔍 Test 7: Parallel Requests');
  console.log('   Sending 5 requests simultaneously...\n');
  
  const client = axios.create({
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });
  
  const operations = ['QueueList', 'StateList', 'PriorityList', 'TypeList', 'UserList'];
  const promises = operations.map(op => makeRequest(client, op, op));
  
  const resultsArr = await Promise.all(promises);
  
  let successCount = 0;
  resultsArr.forEach((r, i) => {
    if (r.success) {
      successCount++;
      console.log(`   ✅ ${operations[i]}: ${r.duration}ms`);
    } else {
      console.log(`   ❌ ${operations[i]}: ${r.error}`);
    }
  });
  
  if (successCount === 5) {
    results.push({ test: 'Parallel Requests', status: '✅ PASS', details: `${successCount}/5 succeeded` });
  } else {
    results.push({ test: 'Parallel Requests', status: '⚠️ PARTIAL', details: `${successCount}/5 succeeded - server may limit concurrent connections` });
  }
  console.log();
}

async function test8_ServerHeaders() {
  console.log('🔍 Test 8: Server Response Headers');
  console.log('   Checking server configuration from response headers...\n');
  
  try {
    const response = await axios.post(`${baseUrl}/QueueList`, {
      UserLogin: OTOBO_USER,
      Password: OTOBO_PASSWORD,
      Valid: 1,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    
    const headers = response.headers;
    const relevantHeaders = [
      'server',
      'connection',
      'keep-alive',
      'x-powered-by',
      'x-frame-options',
      'content-type',
    ];
    
    console.log('   Relevant headers:');
    relevantHeaders.forEach(h => {
      if (headers[h]) {
        console.log(`   • ${h}: ${headers[h]}`);
      }
    });
    
    // Check for proxy indicators
    const proxyHeaders = ['x-forwarded-for', 'x-real-ip', 'via', 'x-proxy-id'];
    const foundProxyHeaders = proxyHeaders.filter(h => headers[h]);
    
    if (foundProxyHeaders.length > 0) {
      console.log('\n   Proxy indicators detected:');
      foundProxyHeaders.forEach(h => console.log(`   • ${h}: ${headers[h]}`));
    }
    
    const serverInfo = headers['server'] || 'Unknown';
    const keepAlive = headers['keep-alive'] || headers['connection'] || 'Not specified';
    
    results.push({ 
      test: 'Server Headers', 
      status: '✅ INFO', 
      details: `Server: ${serverInfo}, Keep-Alive: ${keepAlive}` 
    });
    
  } catch (error: any) {
    results.push({ test: 'Server Headers', status: '❌ FAIL', details: error.message });
    console.log(`   ❌ Could not retrieve headers: ${error.message}`);
  }
  console.log();
}

async function runDiagnostics() {
  try {
    await test1_BasicConnectivity();
    await test2_KeepAlive();
    await test3_NoKeepAlive();
    await test4_RapidRequests();
    await test5_DelayedRequests();
    await test6_IdleConnection();
    await test7_ParallelRequests();
    await test8_ServerHeaders();
  } catch (error) {
    console.error('Diagnostics failed:', error);
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DIAGNOSTIC SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  
  results.forEach(r => {
    console.log(`  ${r.status} ${r.test}`);
    console.log(`     └─ ${r.details}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════════════');
  
  // Analyze results and provide recommendations
  const rapidFailed = results.find(r => r.test === 'Rapid Requests' && r.status.includes('PARTIAL'));
  const idleFailed = results.find(r => r.test === 'Idle Connection (5s)' && r.status.includes('FAIL'));
  const noKeepAliveFailed = results.find(r => r.test === 'No Keep-Alive' && r.status.includes('FAIL'));
  const parallelFailed = results.find(r => r.test === 'Parallel Requests' && r.status.includes('PARTIAL'));
  
  if (noKeepAliveFailed) {
    console.log('  ⚠️  OTOBO SERVER ISSUE');
    console.log('     Even fresh connections fail. Check:');
    console.log('     • OTOBO application logs');
    console.log('     • Database connection pool');
    console.log('     • Server resources (CPU/Memory)');
  } else if (idleFailed) {
    console.log('  ⚠️  KEEP-ALIVE TIMEOUT ISSUE');
    console.log('     Server/proxy is closing idle connections too quickly.');
    console.log('     Check your reverse proxy configuration:');
    console.log('     • Nginx: increase keepalive_timeout (recommend 60s+)');
    console.log('     • Apache: increase KeepAliveTimeout');
    console.log('     • Or set Connection: close in client (current workaround in MCP)');
  } else if (rapidFailed) {
    console.log('  ⚠️  RATE LIMITING DETECTED');
    console.log('     Server is limiting rapid requests. Check:');
    console.log('     • Nginx: limit_req_zone settings');
    console.log('     • Apache: mod_ratelimit settings');
    console.log('     • OTOBO: GenericInterface throttling');
  } else if (parallelFailed) {
    console.log('  ⚠️  CONCURRENT CONNECTION LIMIT');
    console.log('     Server limits simultaneous connections. Check:');
    console.log('     • Nginx: worker_connections');
    console.log('     • Apache: MaxRequestWorkers');
  } else {
    console.log('  ✅ No major issues detected.');
    console.log('     ECONNRESET may be intermittent network issues.');
    console.log('     The retry logic in the MCP should handle this.');
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

runDiagnostics();
