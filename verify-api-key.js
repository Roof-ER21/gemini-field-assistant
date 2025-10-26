#!/usr/bin/env node

/**
 * Gemini API Key Verification Script
 *
 * This script verifies that:
 * 1. The .env.local file exists
 * 2. The GEMINI_API_KEY is set and not a placeholder
 * 3. The API key format is valid
 * 4. The API key works by making a simple test request
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log('\n' + '='.repeat(60));
  log(message, 'cyan');
  console.log('='.repeat(60) + '\n');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

// Load environment variables from .env.local
function loadEnvFile() {
  const envPath = join(__dirname, '.env.local');

  if (!existsSync(envPath)) {
    return null;
  }

  const envContent = readFileSync(envPath, 'utf-8');
  const envVars = {};

  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return envVars;
}

// Validate API key format
function validateApiKeyFormat(apiKey) {
  if (!apiKey) {
    return { valid: false, reason: 'API key is empty or undefined' };
  }

  if (apiKey === 'PLACEHOLDER_API_KEY') {
    return { valid: false, reason: 'API key is still the placeholder value' };
  }

  if (!apiKey.startsWith('AIzaSy')) {
    return { valid: false, reason: 'API key should start with "AIzaSy"' };
  }

  if (apiKey.length !== 39) {
    return {
      valid: false,
      reason: `API key should be 39 characters long (found ${apiKey.length})`
    };
  }

  if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) {
    return {
      valid: false,
      reason: 'API key contains invalid characters'
    };
  }

  return { valid: true };
}

// Test API key with a simple request
async function testApiKey(apiKey) {
  try {
    const { GoogleGenAI } = await import('@google/genai');

    logInfo('Making test request to Gemini API...');

    const ai = new GoogleGenAI({ apiKey });

    // Simple test request
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Say "hello" if you can read this.',
    });

    const text = response.text.toLowerCase();

    if (text.includes('hello')) {
      return { success: true, response: response.text };
    } else {
      return {
        success: true,
        response: response.text,
        warning: 'Got a response but it may not be as expected'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      details: error.toString()
    };
  }
}

// Main verification function
async function verifySetup() {
  logHeader('Gemini API Key Verification');

  let passed = 0;
  let failed = 0;
  let warnings = 0;

  // Check 1: .env.local file exists
  console.log('1. Checking .env.local file...');
  const envVars = loadEnvFile();

  if (!envVars) {
    logError('.env.local file not found');
    logInfo('Create it with: echo "GEMINI_API_KEY=your_key_here" > .env.local');
    failed++;
  } else {
    logSuccess('.env.local file exists');
    passed++;
  }

  if (!envVars) {
    console.log('\n' + '='.repeat(60));
    log(`Final Result: ${failed} critical errors found`, 'red');
    console.log('='.repeat(60));
    process.exit(1);
  }

  // Check 2: GEMINI_API_KEY is set
  console.log('\n2. Checking GEMINI_API_KEY variable...');
  const apiKey = envVars.GEMINI_API_KEY;

  if (!apiKey) {
    logError('GEMINI_API_KEY is not set in .env.local');
    logInfo('Add it with: echo "GEMINI_API_KEY=your_key_here" > .env.local');
    failed++;
  } else {
    logSuccess('GEMINI_API_KEY is set');
    logInfo(`Key preview: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
    passed++;
  }

  if (!apiKey) {
    console.log('\n' + '='.repeat(60));
    log(`Final Result: ${failed} critical errors found`, 'red');
    console.log('='.repeat(60));
    process.exit(1);
  }

  // Check 3: API key format validation
  console.log('\n3. Validating API key format...');
  const formatCheck = validateApiKeyFormat(apiKey);

  if (!formatCheck.valid) {
    logError(`Invalid API key format: ${formatCheck.reason}`);
    logInfo('Get a valid key from: https://aistudio.google.com/apikey');
    failed++;
  } else {
    logSuccess('API key format is valid');
    passed++;
  }

  if (!formatCheck.valid) {
    console.log('\n' + '='.repeat(60));
    log(`Final Result: ${failed} critical errors, ${passed} checks passed`, 'red');
    console.log('='.repeat(60));
    process.exit(1);
  }

  // Check 4: Test API key with actual request
  console.log('\n4. Testing API key with Gemini API...');
  const testResult = await testApiKey(apiKey);

  if (!testResult.success) {
    logError('API key test failed');
    logError(`Error: ${testResult.error}`);
    if (testResult.details) {
      logInfo(`Details: ${testResult.details}`);
    }
    logInfo('Possible issues:');
    logInfo('  - API key is invalid or revoked');
    logInfo('  - API key has incorrect permissions');
    logInfo('  - Network connectivity issues');
    logInfo('  - API quota exceeded');
    logInfo('\nVerify your key at: https://aistudio.google.com/apikey');
    failed++;
  } else {
    logSuccess('API key test passed - successfully connected to Gemini API');
    logSuccess(`Response preview: "${testResult.response.substring(0, 50)}..."`);
    passed++;

    if (testResult.warning) {
      logWarning(testResult.warning);
      warnings++;
    }
  }

  // Check 5: Verify vite.config.ts configuration
  console.log('\n5. Checking Vite configuration...');
  const viteConfigPath = join(__dirname, 'vite.config.ts');

  if (!existsSync(viteConfigPath)) {
    logError('vite.config.ts not found');
    failed++;
  } else {
    const viteConfig = readFileSync(viteConfigPath, 'utf-8');

    if (viteConfig.includes("'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY)")) {
      logSuccess('Vite config correctly maps GEMINI_API_KEY to process.env.API_KEY');
      passed++;
    } else {
      logWarning('Vite config may not be correctly configured');
      logInfo('Expected to find: process.env.API_KEY mapped to env.GEMINI_API_KEY');
      warnings++;
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  if (failed === 0) {
    log('🎉 All checks passed! Your API key is properly configured.', 'green');
    console.log('='.repeat(60));
    logInfo('Next steps:');
    logInfo('  1. Run: npm run dev');
    logInfo('  2. Test each feature in the application');
    logInfo('  3. Check browser console for any runtime errors');

    if (warnings > 0) {
      console.log('');
      logWarning(`${warnings} warning(s) detected - review above for details`);
    }
    process.exit(0);
  } else {
    log(`❌ ${failed} error(s) found, ${passed} check(s) passed`, 'red');
    console.log('='.repeat(60));
    logInfo('Fix the errors above and run this script again.');
    process.exit(1);
  }
}

// Run verification
verifySetup().catch(error => {
  console.error('');
  logError('Verification script failed with unexpected error:');
  console.error(error);
  process.exit(1);
});
