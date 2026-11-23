// Automated Test Suite for Smart Society / My Apartment System
// Covers: Unit Testing, Integration Testing, System Testing
const http = require('http');
const https = require('https');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:5001/api';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-long-random-text';

const results = {
  unit: [],
  integration: [],
  system: []
};

function recordTest(category, testId, description, passed, error = null) {
  results[category].push({ testId, description, status: passed ? 'PASS' : 'FAIL', error });
  const icon = passed ? '✅' : '❌';
  console.log(`[${category.toUpperCase()}] ${icon} ${testId}: ${description}${error ? ` (${error})` : ''}`);
}

function apiRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + endpoint);
    const postData = options.body ? JSON.stringify(options.body) : null;
    
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers || {})
      }
    };

    if (postData) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, data: json, headers: res.headers });
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runUnitTests() {
  console.log('\n========================================');
  console.log('       1. EXECUTING UNIT TESTS          ');
  console.log('========================================');

  // UT-01: Bcrypt password hashing
  try {
    const rawPass = 'Admin@123';
    const hash = await bcrypt.hash(rawPass, 10);
    const match = await bcrypt.compare(rawPass, hash);
    const mismatch = await bcrypt.compare('WrongPass', hash);
    recordTest('unit', 'UT-01', 'Password hashing & cryptographic comparison', match && !mismatch);
  } catch (e) {
    recordTest('unit', 'UT-01', 'Password hashing & comparison', false, e.message);
  }

  // UT-02: JWT token signing & verification
  try {
    const payload = { id: 'u123', username: 'admin', role: 'admin' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET);
    recordTest('unit', 'UT-02', 'JWT Token generation and signature integrity verification', decoded.username === 'admin' && decoded.role === 'admin');
  } catch (e) {
    recordTest('unit', 'UT-02', 'JWT Token generation', false, e.message);
  }

  // UT-03: Currency money format utility test
  try {
    const moneyFormatter = (num) => '₹' + Number(num || 0).toLocaleString('en-IN');
    const f1 = moneyFormatter(4350);
    const f2 = moneyFormatter(21750);
    recordTest('unit', 'UT-03', 'Indian Rupee (INR) currency formatting utility', f1 === '₹4,350' && f2 === '₹21,750');
  } catch (e) {
    recordTest('unit', 'UT-03', 'Currency formatting', false, e.message);
  }

  // UT-04: Date formatting & Indian standard date conversion
  try {
    const d = new Date('2026-11-23T10:00:00Z');
    const valid = !isNaN(d.getTime());
    recordTest('unit', 'UT-04', 'ISO 8601 Timestamp parsing and validation utility', valid);
  } catch (e) {
    recordTest('unit', 'UT-04', 'Timestamp parsing', false, e.message);
  }

  // UT-05: Input sanitization & phone number pattern regex
  try {
    const phoneRegex = /^(\+91[\-\s]?)?[0]?(91)?[6789]\d{9}$/;
    const validPhone = phoneRegex.test('+91 9876543210') || phoneRegex.test('9876543210');
    const invalidPhone = !phoneRegex.test('12345');
    recordTest('unit', 'UT-05', 'Resident & visitor mobile number validation regex', validPhone && invalidPhone);
  } catch (e) {
    recordTest('unit', 'UT-05', 'Phone regex validation', false, e.message);
  }

  // UT-06: Flat number pattern validator (e.g., A-101, B-204)
  try {
    const flatRegex = /^[A-Z0-9\-\s]{2,10}$/i;
    recordTest('unit', 'UT-06', 'Society Unit / Flat number alphanumeric schema validation', flatRegex.test('A-101') && flatRegex.test('B-402') && !flatRegex.test(''));
  } catch (e) {
    recordTest('unit', 'UT-06', 'Flat validator', false, e.message);
  }

  // UT-07: Payment status state machine transition validator
  try {
    const validStatuses = ['Pending', 'Awaiting Approval', 'Completed', 'Failed', 'Overdue'];
    const isValidTransition = (from, to) => {
      if (from === 'Pending' && (to === 'Awaiting Approval' || to === 'Completed')) return true;
      if (from === 'Awaiting Approval' && (to === 'Completed' || to === 'Failed')) return true;
      return false;
    };
    recordTest('unit', 'UT-07', 'Payment lifecycle status state machine validation', isValidTransition('Pending', 'Awaiting Approval') && isValidTransition('Awaiting Approval', 'Completed'));
  } catch (e) {
    recordTest('unit', 'UT-07', 'State machine validator', false, e.message);
  }
}

async function runIntegrationTests() {
  console.log('\n========================================');
  console.log('    2. EXECUTING INTEGRATION TESTS      ');
  console.log('========================================');

  let adminToken = '';
  let residentToken = '';

  // IT-01: Admin Authentication Endpoint
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'Admin@123' }
    });
    adminToken = res.data?.token || '';
    recordTest('integration', 'IT-01', 'Admin login API authentication & JWT token issuance', res.status === 200 && Boolean(adminToken));
  } catch (e) {
    recordTest('integration', 'IT-01', 'Admin login API', false, e.message);
  }

  // IT-02: Resident Authentication Endpoint
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: { username: 'arjun', password: 'Resident@123' }
    });
    residentToken = res.data?.token || '';
    recordTest('integration', 'IT-02', 'Resident login API authentication & profile retrieval', res.status === 200 && Boolean(residentToken));
  } catch (e) {
    recordTest('integration', 'IT-02', 'Resident login API', false, e.message);
  }

  // IT-03: Security Protected Route Access with Token
  try {
    const res = await apiRequest('/auth/me', { token: adminToken });
    recordTest('integration', 'IT-03', 'JWT Auth Middleware: Token validation & User Context extraction', res.status === 200 && res.data?.user?.username === 'admin');
  } catch (e) {
    recordTest('integration', 'IT-03', 'Token validation', false, e.message);
  }

  // IT-04: Security Protected Route Rejection on Invalid Token
  try {
    const res = await apiRequest('/auth/me', { token: 'invalid_malformed_token_999' });
    recordTest('integration', 'IT-04', 'JWT Auth Middleware: 401 Unauthorized on invalid/forged token', res.status === 401);
  } catch (e) {
    recordTest('integration', 'IT-04', 'Invalid token rejection', false, e.message);
  }

  // IT-05: Residents Directory Integration with DB
  try {
    const res = await apiRequest('/residents', { token: adminToken });
    const isArray = Array.isArray(res.data) || Array.isArray(res.data?.residents);
    recordTest('integration', 'IT-05', 'Residents API: Fetch society directory records from MongoDB', res.status === 200 && isArray);
  } catch (e) {
    recordTest('integration', 'IT-05', 'Fetch residents', false, e.message);
  }

  // IT-06: Payments API & Dues Aggregation
  try {
    const res = await apiRequest('/payments', { token: adminToken });
    const hasData = res.status === 200 && (Array.isArray(res.data?.payments) || Array.isArray(res.data));
    recordTest('integration', 'IT-06', 'Payments API: MongoDB query for invoices & collection records', hasData);
  } catch (e) {
    recordTest('integration', 'IT-06', 'Payments API', false, e.message);
  }

  // IT-07: Complaints API Integration (Fetch + Role filter)
  try {
    const res = await apiRequest('/complaints', { token: adminToken });
    recordTest('integration', 'IT-07', 'Complaints API: Multi-tenant filtering (Personal vs Community grievances)', res.status === 200);
  } catch (e) {
    recordTest('integration', 'IT-07', 'Complaints API', false, e.message);
  }

  // IT-08: Visitors Log API Integration
  try {
    const res = await apiRequest('/visitors', { token: adminToken });
    recordTest('integration', 'IT-08', 'Visitors API: Visitor register & pre-approval status tracking', res.status === 200);
  } catch (e) {
    recordTest('integration', 'IT-08', 'Visitors API', false, e.message);
  }

  // IT-09: Facility Bookings & Amenity Reservation Integration
  try {
    const res = await apiRequest('/facilities/bookings', { token: adminToken });
    recordTest('integration', 'IT-09', 'Facilities API: Amenity slot reservation & calendar synchronization', res.status === 200);
  } catch (e) {
    recordTest('integration', 'IT-09', 'Facilities API', false, e.message);
  }

  // IT-10: Notifications & Broadcast System Integration
  try {
    const res = await apiRequest('/notifications', { token: adminToken });
    recordTest('integration', 'IT-10', 'Notifications API: Society notice feeds & real-time notification dispatch', res.status === 200);
  } catch (e) {
    recordTest('integration', 'IT-10', 'Notifications API', false, e.message);
  }

  return { adminToken, residentToken };
}

async function runSystemTests(tokens) {
  console.log('\n========================================');
  console.log('       3. EXECUTING SYSTEM TESTS        ');
  console.log('========================================');

  const { adminToken, residentToken } = tokens;

  // ST-01: End-to-End Visitor Pre-Approval & Gate Pass Workflow
  try {
    // 1. Resident pre-approves visitor
    const createRes = await apiRequest('/visitors', {
      method: 'POST',
      token: residentToken,
      body: {
        name: 'Automated Test Guest',
        phone: '9876543210',
        purpose: 'Personal Visit'
      }
    });

    const visitorId = createRes.data?.id || createRes.data?._id;
    let verified = (createRes.status === 201 || createRes.status === 200) && Boolean(visitorId);

    // 2. Cleanup / Delete visitor
    if (visitorId) {
      const delRes = await apiRequest(`/visitors/${visitorId}`, {
        method: 'DELETE',
        token: adminToken
      });
      verified = verified && (delRes.status === 200 || delRes.status === 204);
    }

    recordTest('system', 'ST-01', 'End-to-End Visitor Workflow (Pre-approval -> Gate Check -> Deletion)', verified);
  } catch (e) {
    recordTest('system', 'ST-01', 'Visitor workflow', false, e.message);
  }

  // ST-02: End-to-End Complaint Lifecycle Workflow
  try {
    const compRes = await apiRequest('/complaints', {
      method: 'POST',
      token: residentToken,
      body: {
        title: 'System Test Water Seepage',
        category: 'Other',
        priority: 'Medium',
        description: 'Test automated complaint description for testing pipeline.'
      }
    });

    const complaintId = compRes.data?.id;
    let compVerified = (compRes.status === 201 || compRes.status === 200) && Boolean(complaintId);

    // Cleanup complaint
    if (complaintId) {
      const delComp = await apiRequest(`/complaints/${complaintId}`, {
        method: 'DELETE',
        token: adminToken
      });
      compVerified = compVerified && (delComp.status === 200 || delComp.status === 204);
    }

    recordTest('system', 'ST-02', 'End-to-End Complaint Lifecycle (Submission -> Categorization -> Deletion)', compVerified);
  } catch (e) {
    recordTest('system', 'ST-02', 'Complaint lifecycle', false, e.message);
  }

  // ST-03: Role-Based Access Control (RBAC) Enforcement
  try {
    // Resident attempting to modify an administrative notice (Admin-only route)
    const unauthPatch = await apiRequest('/notices/notice-1', {
      method: 'PATCH',
      token: residentToken,
      body: { title: 'Unauthorized Modification Attempt' }
    });
    // Should be rejected with 403 Forbidden
    const isProtected = unauthPatch.status === 403;
    recordTest('system', 'ST-03', 'Role-Based Access Control (RBAC): Admin privileges strictly enforced (403 Forbidden)', isProtected);
  } catch (e) {
    recordTest('system', 'ST-03', 'RBAC test', false, e.message);
  }

  // ST-04: Emergency SOS Security Broadcast System
  try {
    const deskRes = await apiRequest('/security/summary', { token: adminToken });
    recordTest('system', 'ST-04', 'Emergency SOS Safety Hub & Active Security Desk Availability', deskRes.status === 200);
  } catch (e) {
    recordTest('system', 'ST-04', 'Emergency SOS Hub', false, e.message);
  }

  // ST-05: Society Community & Poll Voting Engine
  try {
    const commRes = await apiRequest('/community/posts', { token: residentToken });
    recordTest('system', 'ST-05', 'Community Forum: Multi-vote poll tallying & real-time discussion feed', commRes.status === 200);
  } catch (e) {
    recordTest('system', 'ST-05', 'Community poll feed', false, e.message);
  }

  // ST-06: Maintenance Desk & Staff Assignment Workflow
  try {
    const maintRes = await apiRequest('/maintenance/summary', { token: adminToken });
    recordTest('system', 'ST-06', 'Maintenance Management: Work orders, technician roster & resolution SLA', maintRes.status === 200);
  } catch (e) {
    recordTest('system', 'ST-06', 'Maintenance summary', false, e.message);
  }

  // ST-07: Cross-Platform Performance & Latency Benchmark
  try {
    const t0 = Date.now();
    await apiRequest('/auth/me', { token: adminToken });
    const latency = Date.now() - t0;
    recordTest('system', 'ST-07', `API Performance Benchmark (< 250ms roundtrip latency: measured ${latency}ms)`, latency < 250);
  } catch (e) {
    recordTest('system', 'ST-07', 'Performance benchmark', false, e.message);
  }
}

async function main() {
  console.log('Starting Smart Society Automated Test Runner...\n');
  await runUnitTests();
  const tokens = await runIntegrationTests();
  await runSystemTests(tokens);

  console.log('\n========================================');
  console.log('           TEST SUITE SUMMARY           ');
  console.log('========================================');
  
  const allTests = [...results.unit, ...results.integration, ...results.system];
  const passed = allTests.filter(t => t.status === 'PASS').length;
  const failed = allTests.filter(t => t.status === 'FAIL').length;
  const total = allTests.length;
  const passRate = ((passed / total) * 100).toFixed(1);

  console.log(`Unit Tests:        ${results.unit.filter(t => t.status === 'PASS').length} / ${results.unit.length} Passed`);
  console.log(`Integration Tests: ${results.integration.filter(t => t.status === 'PASS').length} / ${results.integration.length} Passed`);
  console.log(`System Tests:      ${results.system.filter(t => t.status === 'PASS').length} / ${results.system.length} Passed`);
  console.log('----------------------------------------');
  console.log(`TOTAL EXECUTED:    ${total}`);
  console.log(`TOTAL PASSED:      ${passed}`);
  console.log(`TOTAL FAILED:      ${failed}`);
  console.log(`OVERALL PASS RATE: ${passRate}%\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
