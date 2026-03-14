/**
 * Quick latency test to compare curl vs axios
 */
import axios from 'axios';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const OTOBO_URL = process.env.OTOBO_URL || 'https://your-otobo-host/otobo/nph-genericinterface.pl/Webservice/Rest';
const OTOBO_USER = process.env.OTOBO_USER;
const OTOBO_PASSWORD = process.env.OTOBO_PASSWORD;

const baseUrl = OTOBO_URL.replace(/\/$/, '');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  Latency Comparison Test');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Target: ${baseUrl}\n`);

async function testAxios(iterations: number) {
  console.log(`📊 Axios (${iterations} requests):`);
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await axios.post(`${baseUrl}/QueueList`, {
      UserLogin: OTOBO_USER,
      Password: OTOBO_PASSWORD,
      Valid: 1,
    }, {
      headers: { 'Content-Type': 'application/json' },
    });
    const elapsed = performance.now() - start;
    times.push(elapsed);
    process.stdout.write(`   ${i + 1}: ${elapsed.toFixed(0)}ms\n`);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(`   ─────────────────────────`);
  console.log(`   Min: ${min.toFixed(0)}ms | Avg: ${avg.toFixed(0)}ms | Max: ${max.toFixed(0)}ms\n`);
  return { avg, min, max };
}

async function testAxiosWithReuse(iterations: number) {
  console.log(`📊 Axios with connection reuse (${iterations} requests):`);
  const times: number[] = [];
  
  // Create a single axios instance
  const client = axios.create({
    baseURL: baseUrl,
    headers: { 'Content-Type': 'application/json' },
    // Disable keep-alive to force fresh connections
  });
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await client.post('/QueueList', {
      UserLogin: OTOBO_USER,
      Password: OTOBO_PASSWORD,
      Valid: 1,
    });
    const elapsed = performance.now() - start;
    times.push(elapsed);
    process.stdout.write(`   ${i + 1}: ${elapsed.toFixed(0)}ms\n`);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(`   ─────────────────────────`);
  console.log(`   Min: ${min.toFixed(0)}ms | Avg: ${avg.toFixed(0)}ms | Max: ${max.toFixed(0)}ms\n`);
  return { avg, min, max };
}

async function testFetch(iterations: number) {
  console.log(`📊 Native fetch (${iterations} requests):`);
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fetch(`${baseUrl}/QueueList`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UserLogin: OTOBO_USER,
        Password: OTOBO_PASSWORD,
        Valid: 1,
      }),
    });
    const elapsed = performance.now() - start;
    times.push(elapsed);
    process.stdout.write(`   ${i + 1}: ${elapsed.toFixed(0)}ms\n`);
  }
  
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  console.log(`   ─────────────────────────`);
  console.log(`   Min: ${min.toFixed(0)}ms | Avg: ${avg.toFixed(0)}ms | Max: ${max.toFixed(0)}ms\n`);
  return { avg, min, max };
}

async function main() {
  const iterations = 5;
  
  const axiosResult = await testAxios(iterations);
  const axiosReuseResult = await testAxiosWithReuse(iterations);
  const fetchResult = await testFetch(iterations);
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  curl (reference):    ~50ms`);
  console.log(`  Axios:               ~${axiosResult.avg.toFixed(0)}ms`);
  console.log(`  Axios (reuse):       ~${axiosReuseResult.avg.toFixed(0)}ms`);
  console.log(`  Native fetch:        ~${fetchResult.avg.toFixed(0)}ms`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (axiosResult.avg > 100) {
    console.log('\n⚠️  Axios overhead detected. Consider:');
    console.log('   • Using native fetch instead');
    console.log('   • Creating a single axios instance and reusing it');
    console.log('   • Checking for DNS resolution delays in Node.js');
  }
}

main();
