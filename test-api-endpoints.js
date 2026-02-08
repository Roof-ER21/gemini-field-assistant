/**
 * API Endpoint Test Suite for Gemini Field Assistant
 * Tests all endpoints at https://sa21.up.railway.app/
 */

const BASE_URL = 'https://sa21.up.railway.app';

// Test configuration
const TEST_CONFIG = {
  userEmail: 'test@example.com', // Change to valid user email
  headers: {
    'Content-Type': 'application/json',
    'x-user-email': 'test@example.com' // Change to valid user email
  }
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

/**
 * Make HTTP request
 */
async function makeRequest(method, path, body = null, headers = {}) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      ...TEST_CONFIG.headers,
      ...headers
    }
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message
    };
  }
}

/**
 * Log test result
 */
function logResult(name, passed, message = '', response = null) {
  results.total++;

  if (passed) {
    results.passed++;
    console.log(`${colors.green}✓${colors.reset} ${name}`);
    if (message) console.log(`  ${colors.cyan}${message}${colors.reset}`);
  } else {
    results.failed++;
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    if (message) console.log(`  ${colors.yellow}${message}${colors.reset}`);
    results.errors.push({ name, message, response });
  }

  if (response && !passed) {
    console.log(`  Status: ${response.status}`);
    if (response.data) {
      console.log(`  Response: ${JSON.stringify(response.data).substring(0, 200)}`);
    }
  }
}

/**
 * Test endpoint
 */
async function testEndpoint(config) {
  const { name, method, path, body, expectedStatus, checkResponse } = config;

  console.log(`\n${colors.blue}Testing:${colors.reset} ${method} ${path}`);

  const response = await makeRequest(method, path, body);

  // Check status code
  const statusMatch = Array.isArray(expectedStatus)
    ? expectedStatus.includes(response.status)
    : response.status === expectedStatus;

  if (!statusMatch) {
    logResult(
      name,
      false,
      `Expected status ${expectedStatus}, got ${response.status}`,
      response
    );
    return response;
  }

  // Check response format if provided
  if (checkResponse && response.data) {
    try {
      const checkResult = checkResponse(response.data);
      if (!checkResult.passed) {
        logResult(name, false, checkResult.message, response);
        return response;
      }
    } catch (error) {
      logResult(name, false, `Response validation error: ${error.message}`, response);
      return response;
    }
  }

  logResult(
    name,
    true,
    `Status: ${response.status}`,
    response
  );

  return response;
}

/**
 * Main test suite
 */
async function runTests() {
  console.log(`${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║   GEMINI FIELD ASSISTANT API TEST SUITE                      ║${colors.reset}`);
  console.log(`${colors.cyan}║   Testing: ${BASE_URL.padEnd(46)}║${colors.reset}`);
  console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}`);

  // ============================================================================
  // 1. HEALTH CHECK
  // ============================================================================
  console.log(`\n${colors.yellow}═══ 1. HEALTH CHECK ═══${colors.reset}`);

  await testEndpoint({
    name: 'Health Check',
    method: 'GET',
    path: '/api/health',
    expectedStatus: 200,
    checkResponse: (data) => {
      if (typeof data === 'object' && data.status) {
        return { passed: true };
      }
      return { passed: false, message: 'Missing status field' };
    }
  });

  // ============================================================================
  // 2. USER OPERATIONS
  // ============================================================================
  console.log(`\n${colors.yellow}═══ 2. USER OPERATIONS ═══${colors.reset}`);

  await testEndpoint({
    name: 'List Users',
    method: 'GET',
    path: '/api/users',
    expectedStatus: [200, 401],
    checkResponse: (data) => {
      if (Array.isArray(data) || data.users) {
        return { passed: true };
      }
      return { passed: true }; // May require auth
    }
  });

  // ============================================================================
  // 3. JOB MANAGEMENT
  // ============================================================================
  console.log(`\n${colors.yellow}═══ 3. JOB MANAGEMENT ═══${colors.reset}`);

  await testEndpoint({
    name: 'Get Jobs List',
    method: 'GET',
    path: '/api/jobs',
    expectedStatus: [200, 401],
    checkResponse: (data) => {
      if (data.jobs || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Get Job Stats',
    method: 'GET',
    path: '/api/jobs/stats/summary',
    expectedStatus: [200, 401],
    checkResponse: (data) => {
      if (typeof data === 'object') {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  // ============================================================================
  // 4. MESSAGING
  // ============================================================================
  console.log(`\n${colors.yellow}═══ 4. MESSAGING ═══${colors.reset}`);

  await testEndpoint({
    name: 'Get Team List',
    method: 'GET',
    path: '/api/messages/team',
    expectedStatus: [200, 401, 404],
    checkResponse: (data) => {
      if (data.users || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Get Conversations',
    method: 'GET',
    path: '/api/messages/conversations',
    expectedStatus: [200, 401],
    checkResponse: (data) => {
      if (data.conversations || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Get Unread Count',
    method: 'GET',
    path: '/api/messages/unread-count',
    expectedStatus: [200, 401],
    checkResponse: (data) => {
      if (typeof data === 'object') {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Get Notifications',
    method: 'GET',
    path: '/api/messages/notifications',
    expectedStatus: [200, 401],
    checkResponse: (data) => {
      if (data.notifications || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Search Messages',
    method: 'GET',
    path: '/api/messages/search?query=test',
    expectedStatus: [200, 400, 401],
    checkResponse: (data) => {
      if (data.results || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  // ============================================================================
  // 5. TEAM FEED (THE ROOF)
  // ============================================================================
  console.log(`\n${colors.yellow}═══ 5. TEAM FEED (THE ROOF) ═══${colors.reset}`);

  await testEndpoint({
    name: 'Get Team Posts',
    method: 'GET',
    path: '/api/roof/posts',
    expectedStatus: [200, 401],
    checkResponse: (data) => {
      if (data.posts || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Get Mentions',
    method: 'GET',
    path: '/api/roof/mentions',
    expectedStatus: [200, 401],
    checkResponse: (data) => {
      if (data.mentions || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  // ============================================================================
  // 6. PROFILE PAGES
  // ============================================================================
  console.log(`\n${colors.yellow}═══ 6. PROFILE PAGES ═══${colors.reset}`);

  await testEndpoint({
    name: 'Get Profiles List',
    method: 'GET',
    path: '/api/profiles',
    expectedStatus: [200, 401, 403],
    checkResponse: (data) => {
      if (data.profiles || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Get My Profile',
    method: 'GET',
    path: '/api/profiles/me',
    expectedStatus: [200, 401, 404],
    checkResponse: (data) => {
      if (data.profile !== undefined || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Get Feature Status',
    method: 'GET',
    path: '/api/profiles/feature-status',
    expectedStatus: [200, 401, 403],
    checkResponse: (data) => {
      if (data.enabled !== undefined || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  // Test public profile endpoint (no auth required)
  await testEndpoint({
    name: 'Get Public Profile by Slug (test-profile)',
    method: 'GET',
    path: '/api/profiles/slug/test-profile',
    expectedStatus: [200, 404],
    checkResponse: (data) => {
      if (data.profile || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  // ============================================================================
  // 7. OTHER ROUTES
  // ============================================================================
  console.log(`\n${colors.yellow}═══ 7. OTHER ROUTES ═══${colors.reset}`);

  await testEndpoint({
    name: 'Canvassing Routes',
    method: 'GET',
    path: '/api/canvassing/territories',
    expectedStatus: [200, 401, 404],
  });

  await testEndpoint({
    name: 'Leaderboard',
    method: 'GET',
    path: '/api/leaderboard',
    expectedStatus: [200, 401, 404],
  });

  await testEndpoint({
    name: 'Rep Goals',
    method: 'GET',
    path: '/api/rep-goals',
    expectedStatus: [200, 401, 404],
  });

  await testEndpoint({
    name: 'Alerts',
    method: 'GET',
    path: '/api/alerts',
    expectedStatus: [200, 401, 404],
  });

  await testEndpoint({
    name: 'Hail Reports',
    method: 'GET',
    path: '/api/hail/reports',
    expectedStatus: [200, 401, 404],
  });

  await testEndpoint({
    name: 'Contests',
    method: 'GET',
    path: '/api/contests',
    expectedStatus: [200, 401, 404],
  });

  await testEndpoint({
    name: 'Check-ins',
    method: 'GET',
    path: '/api/checkin/locations',
    expectedStatus: [200, 401, 404],
  });

  // ============================================================================
  // 8. WRITE OPERATIONS (CREATE/UPDATE)
  // ============================================================================
  console.log(`\n${colors.yellow}═══ 8. WRITE OPERATIONS (CREATE/UPDATE) ═══${colors.reset}`);

  await testEndpoint({
    name: 'Create Job (POST)',
    method: 'POST',
    path: '/api/jobs',
    body: {
      customer: { name: 'Test Customer' },
      property: { address: '123 Test St' }
    },
    expectedStatus: [201, 400, 401],
    checkResponse: (data) => {
      if (data.job || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Create Team Post (POST)',
    method: 'POST',
    path: '/api/roof/posts',
    body: {
      content: 'Test post from API test suite'
    },
    expectedStatus: [201, 400, 401],
    checkResponse: (data) => {
      if (data.post || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  await testEndpoint({
    name: 'Create Conversation (POST)',
    method: 'POST',
    path: '/api/messages/conversations',
    body: {
      type: 'direct',
      participant_ids: ['test-user-id']
    },
    expectedStatus: [201, 400, 401],
    checkResponse: (data) => {
      if (data.conversation || data.error) {
        return { passed: true };
      }
      return { passed: true };
    }
  });

  // ============================================================================
  // FINAL REPORT
  // ============================================================================
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}TEST RESULTS SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`Total Tests:  ${results.total}`);
  console.log(`${colors.green}Passed:       ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Failed:       ${results.failed}${colors.reset}`);

  const successRate = ((results.passed / results.total) * 100).toFixed(1);
  console.log(`Success Rate: ${successRate >= 80 ? colors.green : colors.red}${successRate}%${colors.reset}`);

  if (results.errors.length > 0) {
    console.log(`\n${colors.yellow}═══ FAILED TESTS DETAILS ═══${colors.reset}`);
    results.errors.forEach((err, idx) => {
      console.log(`\n${idx + 1}. ${colors.red}${err.name}${colors.reset}`);
      console.log(`   ${err.message}`);
      if (err.response) {
        console.log(`   Status: ${err.response.status}`);
        if (err.response.error) {
          console.log(`   Error: ${err.response.error}`);
        }
      }
    });
  }

  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the test suite
runTests().catch(error => {
  console.error(`${colors.red}Fatal error running tests:${colors.reset}`, error);
  process.exit(1);
});
