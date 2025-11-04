#!/usr/bin/env node

/**
 * Test Runner Script for DocumentAnalysisPanel
 * Provides utilities for manual and automated testing
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test categories
const testCategories = [
  { id: 1, name: 'Component Rendering', tests: 6 },
  { id: 2, name: 'File Upload - Basic', tests: 5 },
  { id: 3, name: 'File Upload - Validation', tests: 4 },
  { id: 4, name: 'Drag and Drop', tests: 4 },
  { id: 5, name: 'File Management', tests: 3 },
  { id: 6, name: 'Optional Context Fields', tests: 5 },
  { id: 7, name: 'Document Analysis - Processing', tests: 5 },
  { id: 8, name: 'Analysis Loading States', tests: 3 },
  { id: 9, name: 'Analysis Results Display', tests: 6 },
  { id: 10, name: 'Approval Status Badges', tests: 4 },
  { id: 11, name: 'Error Handling', tests: 5 },
  { id: 12, name: 'Edge Cases', tests: 5 },
];

// Generate test files
function generateTestFiles() {
  const testDir = path.join(__dirname, 'test-files');

  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  console.log(`${colors.blue}${colors.bright}📁 Generating Test Files...${colors.reset}\n`);

  // 1. Small text file
  const smallText = `Claim Number: CLM-2024-001
Policy Number: POL-123456
Insurance Company: Test Insurance Co.
Date of Loss: 2024-01-15
Property Address: 123 Main Street, Austin, TX 78701
Claim Amount: $25,000.00
Status: Approved

Description:
Wind and hail damage to roof. Missing shingles on north side.
Fascia damage observed. Gutters detached.`;

  fs.writeFileSync(path.join(testDir, 'claim_details.txt'), smallText);
  console.log(`${colors.green}✓${colors.reset} Generated: claim_details.txt (${smallText.length} bytes)`);

  // 2. Empty file
  fs.writeFileSync(path.join(testDir, 'empty.txt'), '');
  console.log(`${colors.green}✓${colors.reset} Generated: empty.txt (0 bytes)`);

  // 3. Large text file
  let largeText = 'INSURANCE CLAIM REPORT\n' + '='.repeat(50) + '\n\n';
  for (let i = 0; i < 1000; i++) {
    largeText += `Line ${i + 1}: Additional claim details and information. `;
    largeText += `This is test data to create a large file for testing purposes.\n`;
  }
  fs.writeFileSync(path.join(testDir, 'large_claim.txt'), largeText);
  console.log(`${colors.green}✓${colors.reset} Generated: large_claim.txt (${largeText.length} bytes)`);

  // 4. Special characters filename
  const specialCharsContent = 'Test file with special characters in name.';
  fs.writeFileSync(path.join(testDir, 'claim_#1234_-_John\'s_House_(2024).txt'), specialCharsContent);
  console.log(`${colors.green}✓${colors.reset} Generated: claim_#1234_-_John's_House_(2024).txt`);

  // 5. Multiple files for batch testing
  for (let i = 1; i <= 5; i++) {
    const content = `File ${i} - Test claim data\nClaim #${i}-2024\nAmount: $${i * 1000}`;
    fs.writeFileSync(path.join(testDir, `batch_file_${i}.txt`), content);
  }
  console.log(`${colors.green}✓${colors.reset} Generated: batch_file_1.txt through batch_file_5.txt`);

  // 6. Insurance-specific test file
  const insuranceData = `
INSURANCE CLAIM APPROVAL LETTER

Claim Number: CLM-2024-12345
Policy Number: POL-987654
Insured: John Doe
Property: 456 Oak Avenue, Dallas, TX 75201

Dear Mr. Doe,

We are pleased to inform you that your claim has been FULLY APPROVED.

Approved Amount: $45,000.00
Deductible: $2,500.00
Net Payment: $42,500.00

Damage Assessment:
- Roof replacement required (wind damage)
- Siding repair on east wall (hail damage)
- Gutter system replacement
- Fascia and soffit repair

Next Steps:
1. Select a contractor from our approved vendor list
2. Obtain estimates for the repair work
3. Submit contractor information to adjuster
4. Schedule final inspection after repairs

Adjuster Contact:
Name: Jane Smith
Phone: (555) 123-4567
Email: jane.smith@insurance.com

Claim Status: APPROVED - FULL COVERAGE
Approval Date: November 3, 2025

Sincerely,
Test Insurance Company
`;

  fs.writeFileSync(path.join(testDir, 'approval_letter.txt'), insuranceData);
  console.log(`${colors.green}✓${colors.reset} Generated: approval_letter.txt (insurance claim)`);

  // 7. Denial letter
  const denialData = `
CLAIM DENIAL NOTICE

Claim Number: CLM-2024-99999
Policy Number: POL-000001

Dear Policyholder,

After careful review, we regret to inform you that your claim has been DENIED.

Reason for Denial:
The damage reported occurred prior to the policy effective date. Based on our investigation
and the adjuster's report, the roof damage was pre-existing and not covered under your
current policy.

You have the right to appeal this decision within 30 days.

Status: DENIED
Date: November 3, 2025
`;

  fs.writeFileSync(path.join(testDir, 'denial_letter.txt'), denialData);
  console.log(`${colors.green}✓${colors.reset} Generated: denial_letter.txt (denial case)`);

  // 8. Partial approval
  const partialData = `
PARTIAL CLAIM APPROVAL

Claim #: CLM-2024-55555
Original Estimate: $30,000.00
Approved Amount: $18,000.00
Status: PARTIAL APPROVAL

Items Approved:
- Roof repair (wind damage): $15,000
- Gutter replacement: $3,000

Items Denied:
- Cosmetic siding damage: $7,000 (wear and tear, not covered)
- Interior painting: $5,000 (not related to covered loss)
`;

  fs.writeFileSync(path.join(testDir, 'partial_approval.txt'), partialData);
  console.log(`${colors.green}✓${colors.reset} Generated: partial_approval.txt (partial approval)`);

  console.log(`\n${colors.cyan}${colors.bright}📂 Test files directory: ${testDir}${colors.reset}\n`);
}

// Display test checklist
function displayTestChecklist() {
  console.log(`\n${colors.blue}${colors.bright}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.blue}${colors.bright}  DOCUMENT ANALYSIS PANEL - TEST CHECKLIST${colors.reset}`);
  console.log(`${colors.blue}${colors.bright}${'='.repeat(70)}${colors.reset}\n`);

  testCategories.forEach(category => {
    console.log(`${colors.yellow}${category.id}. ${category.name}${colors.reset} (${category.tests} tests)`);
  });

  console.log(`\n${colors.cyan}Total Tests: ${testCategories.reduce((sum, cat) => sum + cat.tests, 0)}${colors.reset}\n`);
}

// Display manual testing instructions
function displayManualTestInstructions() {
  console.log(`\n${colors.blue}${colors.bright}📋 MANUAL TESTING INSTRUCTIONS${colors.reset}\n`);

  const instructions = [
    {
      step: 1,
      title: 'Navigate to Application',
      details: [
        'Open browser to http://localhost:5174',
        'Navigate to "Upload Analysis" section',
        'Verify page loads without errors',
      ],
    },
    {
      step: 2,
      title: 'Test File Upload',
      details: [
        'Click upload zone and select claim_details.txt',
        'Verify file appears in list with correct icon',
        'Check file size is displayed',
        'Try drag-and-drop with approval_letter.txt',
      ],
    },
    {
      step: 3,
      title: 'Test Validation',
      details: [
        'Try uploading empty.txt (should accept but warn)',
        'Try uploading 21 files (should reject after 20)',
        'Create a >10MB file and try uploading (should reject)',
      ],
    },
    {
      step: 4,
      title: 'Test Optional Context',
      details: [
        'Enter property address: "123 Test St, City, TX 12345"',
        'Select claim date: "2025-01-15"',
        'Add notes: "Testing document analysis"',
        'Verify all fields accept input',
      ],
    },
    {
      step: 5,
      title: 'Test Analysis',
      details: [
        'Click "Analyze X Documents with Susan" button',
        'Verify loading animation appears',
        'Wait for analysis to complete',
        'Check for success message',
      ],
    },
    {
      step: 6,
      title: 'Verify Results',
      details: [
        'Check extracted claim information section',
        'Verify analysis summary is generated',
        'Check key findings are listed',
        'Verify recommendations appear',
        'Check next steps section',
        'Verify approval status badge (if applicable)',
      ],
    },
    {
      step: 7,
      title: 'Test Error Cases',
      details: [
        'Test with corrupted file (if available)',
        'Test with no internet connection',
        'Test with AI provider unavailable',
        'Verify error messages are user-friendly',
      ],
    },
    {
      step: 8,
      title: 'Test Different Scenarios',
      details: [
        'Upload approval_letter.txt → expect "Full Approval" badge',
        'Upload denial_letter.txt → expect "Denial" badge',
        'Upload partial_approval.txt → expect "Partial Approval" badge',
        'Upload multiple files → expect combined analysis',
      ],
    },
    {
      step: 9,
      title: 'Test File Management',
      details: [
        'Upload multiple files',
        'Remove individual files using × button',
        'Click "Clear All" button',
        'Verify all files and context cleared',
      ],
    },
    {
      step: 10,
      title: 'Check Browser Console',
      details: [
        'Open DevTools console (F12)',
        'Look for errors (red text)',
        'Check for warnings (yellow text)',
        'Verify no critical issues',
      ],
    },
  ];

  instructions.forEach(({ step, title, details }) => {
    console.log(`${colors.green}${colors.bright}Step ${step}: ${title}${colors.reset}`);
    details.forEach(detail => {
      console.log(`  ${colors.cyan}•${colors.reset} ${detail}`);
    });
    console.log('');
  });
}

// Display quick test scenarios
function displayQuickTests() {
  console.log(`\n${colors.blue}${colors.bright}⚡ QUICK TEST SCENARIOS${colors.reset}\n`);

  const scenarios = [
    {
      name: 'Happy Path - Single File',
      steps: [
        'Upload claim_details.txt',
        'Click Analyze',
        'Verify results display',
      ],
      expected: 'Success with extracted claim data',
    },
    {
      name: 'Full Approval Flow',
      steps: [
        'Upload approval_letter.txt',
        'Add context (address, date)',
        'Click Analyze',
        'Check for green "Full Approval" badge',
      ],
      expected: 'Green approval badge, recommendations shown',
    },
    {
      name: 'Denial Flow',
      steps: [
        'Upload denial_letter.txt',
        'Click Analyze',
        'Check for red "Denial" badge',
      ],
      expected: 'Red denial badge, reason extracted',
    },
    {
      name: 'Multiple Files',
      steps: [
        'Upload batch_file_1.txt through batch_file_5.txt',
        'Click Analyze',
        'Verify all 5 files processed',
      ],
      expected: 'Success header shows 5/5 documents',
    },
    {
      name: 'Empty File Edge Case',
      steps: [
        'Upload empty.txt',
        'Click Analyze',
        'Check behavior',
      ],
      expected: 'Should warn or reject empty file',
    },
    {
      name: 'File Removal',
      steps: [
        'Upload 3 files',
        'Remove middle file',
        'Verify counter updates',
      ],
      expected: 'Counter shows 2 files',
    },
    {
      name: 'Clear All',
      steps: [
        'Upload files and fill context',
        'Click Clear All',
        'Verify everything reset',
      ],
      expected: 'All files gone, fields cleared',
    },
  ];

  scenarios.forEach((scenario, index) => {
    console.log(`${colors.yellow}${index + 1}. ${scenario.name}${colors.reset}`);
    console.log(`   Steps:`);
    scenario.steps.forEach(step => {
      console.log(`     ${colors.cyan}→${colors.reset} ${step}`);
    });
    console.log(`   ${colors.green}Expected:${colors.reset} ${scenario.expected}\n`);
  });
}

// Check if app is running
async function checkAppRunning() {
  try {
    const http = require('http');
    return new Promise((resolve) => {
      const req = http.get('http://localhost:5174', (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch (error) {
    return false;
  }
}

// Main menu
async function displayMenu() {
  console.clear();
  console.log(`${colors.blue}${colors.bright}
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║          DOCUMENT ANALYSIS PANEL - TEST RUNNER                   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
${colors.reset}\n`);

  // Check if app is running
  const isRunning = await checkAppRunning();

  if (isRunning) {
    console.log(`${colors.green}✓ Application Status: RUNNING at http://localhost:5174${colors.reset}\n`);
  } else {
    console.log(`${colors.red}✗ Application Status: NOT RUNNING${colors.reset}`);
    console.log(`${colors.yellow}  Please start the app with: npm run dev${colors.reset}\n`);
  }

  console.log(`${colors.cyan}Available Commands:${colors.reset}\n`);
  console.log(`  ${colors.green}1${colors.reset} - Generate Test Files`);
  console.log(`  ${colors.green}2${colors.reset} - Display Test Checklist`);
  console.log(`  ${colors.green}3${colors.reset} - Show Manual Testing Instructions`);
  console.log(`  ${colors.green}4${colors.reset} - Show Quick Test Scenarios`);
  console.log(`  ${colors.green}5${colors.reset} - View Test Report`);
  console.log(`  ${colors.green}6${colors.reset} - Run All Commands`);
  console.log(`  ${colors.red}0${colors.reset} - Exit\n`);

  console.log(`${colors.yellow}Tip: Run command 6 first to set up everything!${colors.reset}\n`);
}

// View test report
function viewTestReport() {
  const reportPath = path.join(__dirname, 'MANUAL_TEST_EXECUTION_REPORT.md');

  if (fs.existsSync(reportPath)) {
    console.log(`\n${colors.green}✓ Opening test report...${colors.reset}\n`);
    console.log(`${colors.cyan}Report location: ${reportPath}${colors.reset}\n`);

    // Try to open the file with default viewer
    const { exec } = require('child_process');
    const platform = process.platform;

    let command;
    if (platform === 'darwin') command = 'open';
    else if (platform === 'win32') command = 'start';
    else command = 'xdg-open';

    exec(`${command} "${reportPath}"`, (error) => {
      if (error) {
        console.log(`${colors.yellow}Could not auto-open file. Please open manually:${colors.reset}`);
        console.log(`${colors.cyan}${reportPath}${colors.reset}\n`);
      }
    });
  } else {
    console.log(`${colors.red}✗ Test report not found${colors.reset}\n`);
  }
}

// Run all commands
async function runAll() {
  generateTestFiles();
  console.log('');
  displayTestChecklist();
  displayQuickTests();
  displayManualTestInstructions();

  console.log(`${colors.green}${colors.bright}✓ All commands executed!${colors.reset}\n`);
  console.log(`${colors.cyan}You can now start testing the application.${colors.reset}\n`);
}

// Interactive mode
async function interactive() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

  while (true) {
    await displayMenu();

    const answer = await askQuestion(`${colors.bright}Enter command (0-6): ${colors.reset}`);
    const choice = answer.trim();

    console.clear();

    switch (choice) {
      case '1':
        generateTestFiles();
        await askQuestion(`\n${colors.cyan}Press Enter to continue...${colors.reset}`);
        break;
      case '2':
        displayTestChecklist();
        await askQuestion(`\n${colors.cyan}Press Enter to continue...${colors.reset}`);
        break;
      case '3':
        displayManualTestInstructions();
        await askQuestion(`\n${colors.cyan}Press Enter to continue...${colors.reset}`);
        break;
      case '4':
        displayQuickTests();
        await askQuestion(`\n${colors.cyan}Press Enter to continue...${colors.reset}`);
        break;
      case '5':
        viewTestReport();
        await askQuestion(`\n${colors.cyan}Press Enter to continue...${colors.reset}`);
        break;
      case '6':
        await runAll();
        await askQuestion(`\n${colors.cyan}Press Enter to continue...${colors.reset}`);
        break;
      case '0':
        console.log(`\n${colors.green}Thank you for testing! Good luck!${colors.reset}\n`);
        rl.close();
        process.exit(0);
      default:
        console.log(`\n${colors.red}Invalid choice. Please select 0-6.${colors.reset}`);
        await askQuestion(`\n${colors.cyan}Press Enter to continue...${colors.reset}`);
    }
  }
}

// Command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  // Interactive mode
  interactive().catch(console.error);
} else {
  // Direct command mode
  switch (args[0]) {
    case 'generate':
    case 'gen':
      generateTestFiles();
      break;
    case 'checklist':
    case 'check':
      displayTestChecklist();
      break;
    case 'instructions':
    case 'manual':
      displayManualTestInstructions();
      break;
    case 'scenarios':
    case 'quick':
      displayQuickTests();
      break;
    case 'report':
      viewTestReport();
      break;
    case 'all':
      runAll();
      break;
    default:
      console.log(`${colors.red}Unknown command: ${args[0]}${colors.reset}\n`);
      console.log('Available commands:');
      console.log('  generate    - Generate test files');
      console.log('  checklist   - Display test checklist');
      console.log('  instructions - Show manual testing instructions');
      console.log('  scenarios   - Show quick test scenarios');
      console.log('  report      - View test report');
      console.log('  all         - Run all commands');
      console.log('\nOr run without arguments for interactive mode.\n');
  }
}
