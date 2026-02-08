/**
 * HailTrace Automation Script
 *
 * Automates extraction of storm data from HailTrace subscription.
 * Credentials should be set in environment variables:
 *   HAILTRACE_EMAIL
 *   HAILTRACE_PASSWORD
 *
 * Usage:
 *   node hailtrace-scraper.js --address "123 Main St, City, State"
 *   node hailtrace-scraper.js --lat 38.9730 --lng -77.5144
 *   node hailtrace-scraper.js --territory "DMV"
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Configuration
const CONFIG = {
  loginUrl: 'https://app.hailtrace.com/login',
  mapsUrl: 'https://app.hailtrace.com/maps',
  timeout: 30000,
  headless: process.env.HAILTRACE_HEADLESS !== 'false', // Default headless
  outputDir: process.env.HAILTRACE_OUTPUT_DIR || './hailtrace-exports'
};

// Get credentials from environment
const getCredentials = () => {
  const email = process.env.HAILTRACE_EMAIL;
  const password = process.env.HAILTRACE_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing credentials. Set HAILTRACE_EMAIL and HAILTRACE_PASSWORD environment variables.');
  }

  return { email, password };
};

// Parse command line arguments
const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    address: null,
    lat: null,
    lng: null,
    territory: null,
    downloadReport: false,
    outputJson: true,
    debug: false,
    slowMode: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--address':
      case '-a':
        options.address = args[++i];
        break;
      case '--lat':
        options.lat = parseFloat(args[++i]);
        break;
      case '--lng':
        options.lng = parseFloat(args[++i]);
        break;
      case '--territory':
      case '-t':
        options.territory = args[++i];
        break;
      case '--download':
      case '-d':
        options.downloadReport = true;
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--slow':
        options.slowMode = true;
        break;
      case '--help':
      case '-h':
        console.log(`
HailTrace Automation Script

Usage:
  node hailtrace-scraper.js [options]

Options:
  --address, -a <address>   Search by address
  --lat <latitude>          Search by coordinates
  --lng <longitude>         Search by coordinates
  --territory, -t <name>    Search territory (DMV, PA, etc.)
  --download, -d            Download PDF report
  --debug                   Enable debug mode (dumps page structure)
  --slow                    Slow mode with extra delays (for debugging)
  --help, -h                Show this help

Environment Variables:
  HAILTRACE_EMAIL           Your HailTrace login email
  HAILTRACE_PASSWORD        Your HailTrace password
  HAILTRACE_HEADLESS        Set to 'false' to see browser (default: true)
  HAILTRACE_OUTPUT_DIR      Output directory for exports

Examples:
  node hailtrace-scraper.js --address "123 Main St, Arlington, VA"
  node hailtrace-scraper.js --lat 38.9730 --lng -77.5144 --download
  node hailtrace-scraper.js --address "123 Main St" --debug  # Debug mode
  HAILTRACE_HEADLESS=false node hailtrace-scraper.js --address "123 Main St" --slow
        `);
        process.exit(0);
    }
  }

  return options;
};

// Helper function for delays (waitForTimeout is deprecated)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class HailTraceScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  async init() {
    console.log('🚀 Launching browser...');
    this.browser = await puppeteer.launch({
      headless: CONFIG.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Set user agent to avoid detection
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Enable request interception for downloading and API discovery
    this.capturedApiCalls = [];
    await this.page.setRequestInterception(true);
    this.page.on('request', (request) => {
      const url = request.url();
      // Capture API calls for analysis
      if (url.includes('/api/') || url.includes('graphql') || url.includes('/v1/') || url.includes('/v2/')) {
        this.capturedApiCalls.push({
          url: url,
          method: request.method(),
          headers: request.headers(),
          postData: request.postData()
        });
      }
      request.continue();
    });

    // Also capture responses
    this.capturedResponses = [];
    this.page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/') || url.includes('graphql') || url.includes('events') || url.includes('storm')) {
        try {
          const data = await response.json().catch(() => null);
          if (data) {
            this.capturedResponses.push({
              url: url,
              status: response.status(),
              data: data
            });
          }
        } catch (e) {
          // Ignore non-JSON responses
        }
      }
    });
  }

  async login() {
    const { email, password } = getCredentials();

    console.log('🔐 Logging into HailTrace...');
    await this.page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

    // Wait for login form
    await this.page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email"]', { timeout: 10000 });

    // Find and fill email field
    const emailInput = await this.page.$('input[type="email"]') ||
                       await this.page.$('input[name="email"]') ||
                       await this.page.$('input[placeholder*="email"]');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email, { delay: 50 });
    }

    // Find and fill password field
    const passwordInput = await this.page.$('input[type="password"]') ||
                          await this.page.$('input[name="password"]');
    if (passwordInput) {
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(password, { delay: 50 });
    }

    // Click login button - try multiple approaches
    let loginClicked = false;

    // Try Puppeteer's locator with text (handles "Log In" properly)
    try {
      await this.page.locator('::-p-text(Log In)').click({ timeout: 3000 });
      loginClicked = true;
      console.log('Clicked login button via ::-p-text selector');
    } catch (e) {
      console.log('Text selector for Log In failed, trying alternatives...');
    }

    if (!loginClicked) {
      const loginButton = await this.page.$('button[type="submit"]') ||
                          await this.page.$('button:has-text("Login")') ||
                          await this.page.$('button:has-text("Log In")') ||
                          await this.page.$('button:has-text("Sign In")') ||
                          await this.page.$('input[type="submit"]');

      if (loginButton) {
        await loginButton.click();
        loginClicked = true;
      }
    }

    if (!loginClicked) {
      // Find button by evaluating page
      const clicked = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase().trim() || '';
          if (text.includes('log in') || text.includes('login') || text.includes('sign in')) {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        // Try pressing Enter as last resort
        await this.page.keyboard.press('Enter');
      }
    }

    // Wait for navigation/login to complete
    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONFIG.timeout }).catch(() => {});

    // Check if login was successful
    const currentUrl = this.page.url();
    if (currentUrl.includes('login') || currentUrl.includes('signin')) {
      // Check for error message
      const errorMsg = await this.page.$eval('.error, .alert-danger, [class*="error"]', el => el.textContent).catch(() => null);
      throw new Error(`Login failed: ${errorMsg || 'Unknown error'}`);
    }

    console.log('✅ Logged in successfully!');
    this.isLoggedIn = true;
  }

  async searchAddress(address) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    console.log(`🔍 Searching for address: ${address}`);

    // Navigate to maps page
    await this.page.goto(CONFIG.mapsUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

    // Wait for page to fully load
    await delay(2000);

    // Take screenshot to see current state
    await this.takeScreenshot('before-search.png');

    // STEP 1: Find and use the "Search for Address" input directly
    // NOTE: The "Search for places" checkbox is for place TYPE filtering, NOT Google Places
    console.log('Step 1: Finding search input...');
    const searchInput = await this.findSearchInput();

    if (!searchInput) {
      console.log('⚠️ Could not find search input');
      return await this.extractStormData();
    }

    // STEP 2: Type the address
    console.log('Step 2: Typing address in search input...');
    await searchInput.click();
    await delay(300);

    // Clear any existing text
    await searchInput.click({ clickCount: 3 });
    await delay(100);
    await this.page.keyboard.press('Backspace');
    await delay(200);

    // Type address slowly to trigger autocomplete
    await searchInput.type(address, { delay: 80 });
    console.log(`Typed address: ${address}`);

    // Take screenshot to see autocomplete
    await this.takeScreenshot('after-typing.png');

    // Wait for Google Places autocomplete to appear
    console.log('Step 3: Waiting for autocomplete...');
    await delay(2000);

    // Take screenshot to see autocomplete
    await this.takeScreenshot('autocomplete.png');

    // STEP 4: Select from Google Places autocomplete
    console.log('Step 4: Selecting from autocomplete...');
    await this.takeScreenshot('autocomplete.png');
    const selected = await this.selectAutocomplete();

    if (!selected) {
      console.log('⚠️ Autocomplete selection failed, trying keyboard fallback');
      await this.page.keyboard.press('ArrowDown');
      await delay(300);
      await this.page.keyboard.press('Enter');
    }

    // Wait for results to load (map to update, data to fetch)
    console.log('Step 5: Waiting for results...');
    await delay(8000);

    // Take screenshot after search
    await this.takeScreenshot('after-search.png');

    return await this.extractStormData();
  }

  /**
   * Find the search input field using multiple strategies
   */
  async findSearchInput() {
    const searchSelectors = [
      'input[placeholder="Search for Address"]',
      'input[placeholder*="Address"]',
      'input[placeholder*="address"]',
      'input[placeholder*="Search"]',
      'input[placeholder*="place"]',
      'input[placeholder*="Place"]',
      'input[type="search"]',
      '.search-input input',
      '[class*="search"] input',
      'input[type="text"]:not([type="hidden"])'
    ];

    for (const selector of searchSelectors) {
      const input = await this.page.$(selector);
      if (input) {
        const isVisible = await input.isIntersectingViewport().catch(() => false);
        if (isVisible) {
          console.log(`Found search input: ${selector}`);
          return input;
        }
      }
    }

    // Fallback: find by evaluating in page context
    const input = await this.page.evaluateHandle(() => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        const placeholder = input.placeholder?.toLowerCase() || '';
        if (placeholder.includes('address') || placeholder.includes('search') || placeholder.includes('place')) {
          return input;
        }
      }
      return null;
    });

    if (input && input.asElement()) {
      console.log('Found search input via page evaluation');
      return input.asElement();
    }

    console.log('⚠️ Could not find search input');
    return null;
  }

  /**
   * Open the "Select a place" dropdown to reveal Google Places search
   */
  async openPlaceDropdown() {
    console.log('Opening "Select a place" dropdown...');

    // Strategy 1: Click on "Select a place" text using ::-p-text
    try {
      await this.page.locator('::-p-text(Select a place)').click({ timeout: 3000 });
      console.log('Clicked "Select a place" dropdown');
      await delay(500);
      return true;
    } catch (e) {
      console.log('Strategy 1 (text selector) failed:', e.message);
    }

    // Strategy 2: Find dropdown by placeholder or aria-label
    try {
      const dropdown = await this.page.$('[placeholder*="Select"], [aria-label*="Select a place"], [class*="select"]');
      if (dropdown) {
        await dropdown.click();
        console.log('Clicked dropdown via selector');
        await delay(500);
        return true;
      }
    } catch (e) {
      console.log('Strategy 2 failed:', e.message);
    }

    // Strategy 3: Evaluate and click in page context
    try {
      const clicked = await this.page.evaluate(() => {
        // Find element containing "Select a place" text
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent?.trim() === 'Select a place' ||
              el.innerText?.trim() === 'Select a place') {
            // Click the element or its clickable parent
            const clickTarget = el.closest('div, button, [role="button"], [class*="select"]') || el;
            clickTarget.click();
            return true;
          }
        }
        return false;
      });

      if (clicked) {
        console.log('Clicked dropdown via page evaluation');
        await delay(500);
        return true;
      }
    } catch (e) {
      console.log('Strategy 3 failed:', e.message);
    }

    // Strategy 4: Click on the dropdown arrow/chevron area
    try {
      const dropdownPosition = await this.page.evaluate(() => {
        const selectElement = document.querySelector('[class*="select"], [class*="dropdown"]');
        if (selectElement) {
          const rect = selectElement.getBoundingClientRect();
          return { x: rect.right - 20, y: rect.top + rect.height / 2 };
        }
        return null;
      });

      if (dropdownPosition) {
        await this.page.mouse.click(dropdownPosition.x, dropdownPosition.y);
        console.log('Clicked dropdown via coordinates');
        await delay(500);
        return true;
      }
    } catch (e) {
      console.log('Strategy 4 failed:', e.message);
    }

    return false;
  }

  /**
   * Enable the "Search for places" checkbox using multiple strategies
   * This is critical for enabling Google Places autocomplete
   */
  async enableSearchForPlaces() {
    // Strategy 0: Use Puppeteer's modern ::-p-text() selector (best approach)
    try {
      // Try clicking directly using text selector
      await this.page.locator('::-p-text(Search for places)').click({ timeout: 3000 });
      console.log('Checkbox strategy 0 (::-p-text selector): clicked');
      await delay(500);

      const isChecked = await this.isCheckboxChecked();
      if (isChecked) return true;
    } catch (e) {
      console.log('Strategy 0 failed:', e.message);
    }

    // Strategy 0b: Try aria-label or title containing the text
    try {
      const clicked = await this.page.evaluate(() => {
        // Find by aria-label
        const ariaEl = document.querySelector('[aria-label*="Search for places"]');
        if (ariaEl) {
          ariaEl.click();
          return 'aria-label';
        }

        // Find by title
        const titleEl = document.querySelector('[title*="Search for places"]');
        if (titleEl) {
          titleEl.click();
          return 'title';
        }

        // Find by data attributes
        const dataEl = document.querySelector('[data-tooltip*="Search"], [data-tip*="Search"]');
        if (dataEl) {
          dataEl.click();
          return 'data-attr';
        }

        return null;
      });

      if (clicked) {
        console.log(`Checkbox strategy 0b (${clicked}): success`);
        await delay(500);
        const isChecked = await this.isCheckboxChecked();
        if (isChecked) return true;
      }
    } catch (e) {
      console.log('Strategy 0b failed:', e.message);
    }

    // Strategy 1: Click the checkbox input directly
    try {
      const checkboxClicked = await this.page.evaluate(() => {
        // Find checkbox near "Search for places" text
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent?.trim() === 'Search for places' ||
              el.innerText?.trim() === 'Search for places') {
            // Found the label, look for checkbox nearby
            const parent = el.closest('label') || el.parentElement;
            if (parent) {
              // Click the parent container (might be a custom checkbox)
              parent.click();
              return 'clicked-parent';
            }
          }
        }
        return null;
      });

      if (checkboxClicked) {
        console.log(`Checkbox strategy 1 (label parent): ${checkboxClicked}`);
        await delay(500);

        // Verify if checkbox is now checked
        const isChecked = await this.isCheckboxChecked();
        if (isChecked) return true;
      }
    } catch (e) {
      console.log('Strategy 1 failed:', e.message);
    }

    // Strategy 2: Find and click actual input[type="checkbox"]
    try {
      const checkboxes = await this.page.$$('input[type="checkbox"]');
      for (const checkbox of checkboxes) {
        const isVisible = await checkbox.isIntersectingViewport().catch(() => false);
        if (isVisible) {
          // Check if this checkbox is near "Search for places" text
          const isRelated = await this.page.evaluate((cb) => {
            const rect = cb.getBoundingClientRect();
            const nearby = document.elementFromPoint(rect.x + rect.width + 10, rect.y + rect.height / 2);
            return nearby?.textContent?.includes('Search for places') ||
                   cb.parentElement?.textContent?.includes('Search for places') ||
                   cb.closest('label')?.textContent?.includes('Search for places');
          }, checkbox);

          if (isRelated) {
            await checkbox.click();
            console.log('Checkbox strategy 2 (direct checkbox): clicked');
            await delay(500);
            return true;
          }
        }
      }
    } catch (e) {
      console.log('Strategy 2 failed:', e.message);
    }

    // Strategy 3: Click by coordinates (checkbox visible in screenshot)
    try {
      // The checkbox appears below the search input, around x:90, y:70 based on screenshot
      const clicked = await this.page.evaluate(() => {
        // Find the checkbox container by looking for specific class patterns
        const checkboxContainer = document.querySelector('[class*="checkbox"]') ||
                                  document.querySelector('[class*="Checkbox"]') ||
                                  document.querySelector('[role="checkbox"]');
        if (checkboxContainer) {
          checkboxContainer.click();
          return 'checkbox-container';
        }

        // Look for the label and click it
        const labels = document.querySelectorAll('label, span');
        for (const label of labels) {
          if (label.textContent?.includes('Search for places')) {
            label.click();
            return 'label-click';
          }
        }
        return null;
      });

      if (clicked) {
        console.log(`Checkbox strategy 3 (container/label): ${clicked}`);
        await delay(500);

        const isChecked = await this.isCheckboxChecked();
        if (isChecked) return true;
      }
    } catch (e) {
      console.log('Strategy 3 failed:', e.message);
    }

    // Strategy 4: Use mouse click on approximate position
    try {
      // Based on screenshot, checkbox is roughly at position (90, 70) relative to viewport
      // But we need to find it dynamically
      const checkboxPosition = await this.page.evaluate(() => {
        const searchInput = document.querySelector('input[placeholder*="Address"]') ||
                           document.querySelector('input[placeholder*="Search"]');
        if (searchInput) {
          const rect = searchInput.getBoundingClientRect();
          // Checkbox is below the search input, slightly to the left
          return { x: rect.left + 20, y: rect.bottom + 25 };
        }
        return null;
      });

      if (checkboxPosition) {
        console.log(`Checkbox strategy 4 (coordinate click): ${JSON.stringify(checkboxPosition)}`);
        await this.page.mouse.click(checkboxPosition.x, checkboxPosition.y);
        await delay(500);

        const isChecked = await this.isCheckboxChecked();
        if (isChecked) return true;
      }
    } catch (e) {
      console.log('Strategy 4 failed:', e.message);
    }

    // Strategy 5: Dispatch events programmatically (for React/Vue synthetic events)
    try {
      const dispatched = await this.page.evaluate(() => {
        const checkbox = document.querySelector('input[type="checkbox"]');
        if (checkbox) {
          // Dispatch multiple events to ensure React/Vue picks up the change
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('input', { bubbles: true }));
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return true;
        }
        return false;
      });

      if (dispatched) {
        console.log('Checkbox strategy 5 (event dispatch): success');
        await delay(500);
        return true;
      }
    } catch (e) {
      console.log('Strategy 5 failed:', e.message);
    }

    // Strategy 6: XPath-based text matching (very reliable)
    try {
      const elements = await this.page.$x("//*[contains(text(), 'Search for places')]");
      if (elements.length > 0) {
        console.log(`Found ${elements.length} elements with XPath containing 'Search for places'`);
        for (const el of elements) {
          try {
            // Try clicking the element directly
            await el.click();
            console.log('Checkbox strategy 6 (XPath): clicked element');
            await delay(500);

            const isChecked = await this.isCheckboxChecked();
            if (isChecked) return true;

            // Also try clicking parent
            const parent = await el.evaluateHandle(e => e.parentElement);
            if (parent) {
              await parent.click();
              await delay(300);
              if (await this.isCheckboxChecked()) return true;
            }
          } catch (clickError) {
            // Continue to next element
          }
        }
      }
    } catch (e) {
      console.log('Strategy 6 failed:', e.message);
    }

    // Strategy 7: Find checkbox icon/svg element (custom styled checkboxes)
    try {
      const clicked = await this.page.evaluate(() => {
        // Look for common custom checkbox patterns
        const patterns = [
          'svg[class*="check"]',
          '[class*="checkbox-icon"]',
          '[class*="toggle"]',
          '[class*="switch"]',
          '.MuiCheckbox-root', // Material UI
          '.ant-checkbox', // Ant Design
          '.chakra-checkbox', // Chakra UI
          '[class*="Checkbox"]',
          'span[class*="box"]'
        ];

        for (const pattern of patterns) {
          const elements = document.querySelectorAll(pattern);
          for (const el of elements) {
            // Check if this is near "Search for places" text
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const nearbyText = el.parentElement?.textContent || '';
              if (nearbyText.includes('Search for places') ||
                  nearbyText.includes('places')) {
                el.click();
                return `clicked-${pattern}`;
              }
            }
          }
        }
        return null;
      });

      if (clicked) {
        console.log(`Checkbox strategy 7 (custom checkbox): ${clicked}`);
        await delay(500);
        const isChecked = await this.isCheckboxChecked();
        if (isChecked) return true;
      }
    } catch (e) {
      console.log('Strategy 7 failed:', e.message);
    }

    // Strategy 8: Simulate Tab navigation to checkbox and Space to toggle
    try {
      const searchInput = await this.findSearchInput();
      if (searchInput) {
        await searchInput.focus();
        // Tab to the checkbox (usually next focusable element)
        await this.page.keyboard.press('Tab');
        await delay(200);
        // Press Space to toggle checkbox
        await this.page.keyboard.press('Space');
        console.log('Checkbox strategy 8 (keyboard nav): Tab + Space');
        await delay(500);
        const isChecked = await this.isCheckboxChecked();
        if (isChecked) return true;
      }
    } catch (e) {
      console.log('Strategy 8 failed:', e.message);
    }

    return false;
  }

  /**
   * Check if the "Search for places" checkbox is currently checked
   */
  async isCheckboxChecked() {
    return await this.page.evaluate(() => {
      // Method 1: Standard input checkbox
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (const cb of checkboxes) {
        if (cb.closest('label')?.textContent?.includes('Search for places') ||
            cb.parentElement?.textContent?.includes('Search for places')) {
          return cb.checked;
        }
      }

      // Method 2: aria-checked on custom components
      const ariaCheckboxes = document.querySelectorAll('[role="checkbox"]');
      for (const cb of ariaCheckboxes) {
        const nearText = cb.closest('label')?.textContent ||
                         cb.parentElement?.textContent ||
                         cb.nextElementSibling?.textContent || '';
        if (nearText.includes('Search for places')) {
          return cb.getAttribute('aria-checked') === 'true';
        }
      }

      // Method 3: Check for checked class patterns
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent?.includes('Search for places') &&
            el.children.length <= 2) {
          // Found the label, check sibling/parent for checked state
          const container = el.closest('label, div, span');
          if (container) {
            const hasCheckedClass = container.className?.includes('checked') ||
                                    container.className?.includes('Checked') ||
                                    container.className?.includes('active') ||
                                    container.className?.includes('selected') ||
                                    container.className?.includes('on');
            if (hasCheckedClass) return true;

            // Check input inside container
            const input = container.querySelector('input[type="checkbox"]');
            if (input?.checked) return true;
          }
        }
      }

      // Method 4: Check if pac-container (Google Places) is visible
      // This indicates the checkbox is effectively "on"
      const pacContainer = document.querySelector('.pac-container');
      if (pacContainer && pacContainer.style.display !== 'none') {
        return true;
      }

      return false;
    });
  }

  /**
   * Select from Google Places autocomplete dropdown
   * Google Places uses .pac-container which is appended to document.body
   */
  async selectAutocomplete() {
    // Google Places autocomplete selectors (pac = Places AutoComplete)
    const googlePlacesSelectors = [
      '.pac-container .pac-item',           // Standard Google Places
      '.pac-container .pac-item:first-child',
      '.pac-item',
      '.pac-item-query',                    // The query match part
    ];

    // Wait for Google Places container to appear
    try {
      await this.page.waitForSelector('.pac-container', { timeout: 5000, visible: true });
      console.log('Google Places autocomplete container detected');

      // Click the first suggestion
      const firstItem = await this.page.$('.pac-container .pac-item');
      if (firstItem) {
        await firstItem.click();
        console.log('Clicked first Google Places suggestion');
        return true;
      }
    } catch (e) {
      console.log('Google Places container not found, trying alternatives...');
    }

    // Alternative: Custom autocomplete selectors
    const customSelectors = [
      '[class*="autocomplete"] [class*="item"]',
      '[class*="autocomplete"] [class*="option"]',
      '[class*="suggestion"]',
      '[class*="Suggestion"]',
      '.dropdown-item',
      'li[role="option"]',
      '[role="listbox"] [role="option"]',
      '[data-testid*="suggestion"]',
      '[data-testid*="autocomplete"]'
    ];

    for (const selector of customSelectors) {
      try {
        const item = await this.page.$(selector);
        if (item) {
          const isVisible = await item.isIntersectingViewport().catch(() => false);
          if (isVisible) {
            await item.click();
            console.log(`Clicked autocomplete item: ${selector}`);
            return true;
          }
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Last resort: evaluate and click in page context
    try {
      const clicked = await this.page.evaluate(() => {
        // Look for any dropdown/list that appeared
        const lists = document.querySelectorAll('ul, [role="listbox"], .pac-container');
        for (const list of lists) {
          const items = list.querySelectorAll('li, [role="option"], .pac-item');
          if (items.length > 0) {
            items[0].click();
            return true;
          }
        }
        return false;
      });

      if (clicked) {
        console.log('Clicked autocomplete via page evaluation');
        return true;
      }
    } catch (e) {
      console.log('Page evaluation click failed:', e.message);
    }

    return false;
  }

  async searchCoordinates(lat, lng) {
    if (!this.isLoggedIn) {
      await this.login();
    }

    console.log(`🔍 Searching coordinates: ${lat}, ${lng}`);

    // Navigate to maps with coordinates and center marker
    const url = `${CONFIG.mapsUrl}?lat=${lat}&lng=${lng}&zoom=12&m=${lat},${lng},12`;
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

    // Wait for initial load
    await delay(2000);

    // Take screenshot before waiting for data
    await this.takeScreenshot('coordinates-initial.png');

    // Wait for data to load (skeleton loaders to disappear)
    console.log('⏳ Waiting for storm data to load...');
    await this.waitForDataLoad(20000);

    // Additional wait for any animations/final renders
    await delay(2000);

    // Take screenshot after data loads
    await this.takeScreenshot('coordinates-loaded.png');

    return await this.extractStormData();
  }

  async extractStormData() {
    console.log('📊 Extracting storm data...');

    // Wait a bit more for data to load after map moves
    await delay(2000);

    const data = await this.page.evaluate(() => {
      const result = {
        address: null,
        coordinates: { lat: null, lng: null },
        damageScore: null,
        events: [],
        recentEvents: [],
        summary: null,
        rawPageData: {},
        extractedAt: new Date().toISOString()
      };

      // Try to extract address from search input or display
      const searchInput = document.querySelector('input[placeholder*="Address"]') ||
                          document.querySelector('input[placeholder*="Search"]');
      if (searchInput && searchInput.value) {
        result.address = searchInput.value;
      }

      // Try to extract from any address display element
      const addressSelectors = [
        '[class*="address"]',
        '[class*="location"]',
        '.location-name',
        'h1', 'h2', 'h3',
        '[class*="title"]'
      ];
      for (const selector of addressSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim() && !result.address) {
          const text = el.textContent.trim();
          // Check if it looks like an address (contains numbers and letters)
          if (/\d+.*[a-zA-Z]/.test(text) && text.length < 200) {
            result.address = text;
            break;
          }
        }
      }

      // Try to extract damage/risk score
      const scoreSelectors = [
        '[class*="score"]',
        '[class*="Score"]',
        '[class*="damage"]',
        '[class*="Damage"]',
        '[class*="risk"]',
        '[class*="Risk"]',
        '[class*="rating"]'
      ];
      for (const selector of scoreSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent;
          const match = text.match(/(\d+)/);
          if (match) {
            result.damageScore = parseInt(match[1]);
            break;
          }
        }
      }

      // Extract from "Most Recent Events" section (visible in HailTrace UI)
      const eventSectionHeader = Array.from(document.querySelectorAll('*')).find(
        el => el.textContent?.includes('Most Recent Events') ||
              el.textContent?.includes('Recent Events') ||
              el.textContent?.includes('Storm Events')
      );

      if (eventSectionHeader) {
        result.rawPageData.eventSectionFound = true;

        // Look for event count
        const countMatch = document.body.textContent.match(/(\d+)\s*events?\s*found/i);
        if (countMatch) {
          result.rawPageData.eventCount = parseInt(countMatch[1]);
        }
      }

      // Look for skeleton loaders (indicates data is still loading)
      const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="Skeleton"], [class*="loading"], [class*="Loading"]');
      result.rawPageData.hasSkeletonLoaders = skeletons.length > 0;

      // Extract event cards/rows
      const eventContainers = document.querySelectorAll(
        '[class*="event"], [class*="Event"], [class*="card"], [class*="Card"], ' +
        'table tbody tr, .list-item, [class*="item"], [class*="Item"]'
      );

      eventContainers.forEach((container, index) => {
        const text = container.textContent || '';

        // Skip navigation elements, headers, etc.
        if (text.includes('Previous') || text.includes('Next') ||
            text.includes('Maps') || text.includes('Campaigns') ||
            text.length < 5 || text.length > 500) {
          return;
        }

        const event = {
          date: null,
          type: null,
          size: null,
          wind: null,
          source: 'HailTrace',
          rawText: text.substring(0, 200)
        };

        // Parse date patterns
        const datePatterns = [
          /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,           // MM/DD/YYYY
          /(\w{3,9}\s+\d{1,2},?\s+\d{4})/,                  // Month DD, YYYY
          /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/               // YYYY-MM-DD
        ];

        for (const pattern of datePatterns) {
          const match = text.match(pattern);
          if (match) {
            event.date = match[1];
            break;
          }
        }

        // Parse hail size
        const hailPatterns = [
          /(\d+\.?\d*)\s*["″]\s*(?:hail)?/i,                // 1.5" hail
          /(\d+\.?\d*)\s*(?:inch|in)\s*(?:hail)?/i,         // 1.5 inch hail
          /hail[:\s]*(\d+\.?\d*)\s*["″in]?/i,               // hail: 1.5"
          /(\d+\.?\d*)\s*(?:diameter|dia)/i                  // 1.5 diameter
        ];

        for (const pattern of hailPatterns) {
          const match = text.match(pattern);
          if (match) {
            event.size = parseFloat(match[1]);
            event.type = 'Hail';
            break;
          }
        }

        // Parse wind speed
        const windPatterns = [
          /(\d+)\s*(?:mph|MPH)/,                            // 60 mph
          /(\d+)\s*(?:knots?|kts?)/i,                       // 60 knots
          /wind[:\s]*(\d+)/i                                 // wind: 60
        ];

        for (const pattern of windPatterns) {
          const match = text.match(pattern);
          if (match) {
            event.wind = parseInt(match[1]);
            if (!event.type) event.type = 'Wind';
            break;
          }
        }

        // Only add if we found meaningful data
        if (event.date || event.size || event.wind) {
          result.events.push(event);
        }
      });

      // Try to extract coordinates from URL or page data
      const url = window.location.href;
      const latMatch = url.match(/lat[=:](-?\d+\.?\d*)/);
      const lngMatch = url.match(/(?:lng|lon)[=:](-?\d+\.?\d*)/);
      if (latMatch) result.coordinates.lat = parseFloat(latMatch[1]);
      if (lngMatch) result.coordinates.lng = parseFloat(lngMatch[1]);

      // Look for coordinates in page content
      const coordPattern = /(-?\d{2,3}\.\d{4,}),?\s*(-?\d{2,3}\.\d{4,})/;
      const coordMatch = document.body.textContent.match(coordPattern);
      if (coordMatch && !result.coordinates.lat) {
        result.coordinates.lat = parseFloat(coordMatch[1]);
        result.coordinates.lng = parseFloat(coordMatch[2]);
      }

      // Try to get any summary or description
      const summarySelectors = [
        '.summary',
        '.description',
        '[class*="summary"]',
        '[class*="description"]',
        '[class*="info"]',
        'p'
      ];

      for (const selector of summarySelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent.trim();
          if (text.length > 20 && text.length < 500 &&
              !text.includes('Previous') && !text.includes('Maps')) {
            result.summary = text;
            break;
          }
        }
      }

      return result;
    });

    // Log extraction results
    console.log(`✅ Extracted ${data.events.length} storm events`);
    if (data.address) console.log(`   Address: ${data.address}`);
    if (data.damageScore) console.log(`   Damage Score: ${data.damageScore}`);
    if (data.rawPageData.eventCount !== undefined) {
      console.log(`   Event count from page: ${data.rawPageData.eventCount}`);
    }
    if (data.rawPageData.hasSkeletonLoaders) {
      console.log('   ⚠️ Page still has skeleton loaders - data may still be loading');
    }

    return data;
  }

  async downloadReport(address) {
    console.log('📥 Attempting to download report...');

    // Look for download/report button
    const downloadBtn = await this.page.$('button:has-text("Report")') ||
                        await this.page.$('button:has-text("Download")') ||
                        await this.page.$('button:has-text("PDF")') ||
                        await this.page.$('[class*="download"]') ||
                        await this.page.$('[class*="report"]');

    if (!downloadBtn) {
      console.log('⚠️ No download button found');
      return null;
    }

    // Set up download path
    const outputDir = path.resolve(CONFIG.outputDir);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Configure download behavior
    const client = await this.page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: outputDir
    });

    // Click download button
    await downloadBtn.click();

    // Wait for download
    await delay(5000);

    // Find the downloaded file
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.pdf'));
    if (files.length > 0) {
      const latestFile = files.sort((a, b) => {
        return fs.statSync(path.join(outputDir, b)).mtime - fs.statSync(path.join(outputDir, a)).mtime;
      })[0];

      console.log(`✅ Downloaded report: ${latestFile}`);
      return path.join(outputDir, latestFile);
    }

    console.log('⚠️ No PDF file found after download attempt');
    return null;
  }

  async takeScreenshot(filename) {
    const outputDir = path.resolve(CONFIG.outputDir);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filepath = path.join(outputDir, filename);
    await this.page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot saved: ${filepath}`);
    return filepath;
  }

  /**
   * Debug method to dump page structure and find interactive elements
   */
  async debugPageStructure() {
    console.log('\n🔍 === DEBUG: Page Structure Analysis ===\n');

    const debug = await this.page.evaluate(() => {
      const result = {
        url: window.location.href,
        title: document.title,
        inputs: [],
        checkboxes: [],
        buttons: [],
        interactiveElements: [],
        textContent: []
      };

      // Find all inputs
      document.querySelectorAll('input').forEach((input, i) => {
        result.inputs.push({
          index: i,
          type: input.type,
          name: input.name,
          placeholder: input.placeholder,
          value: input.value,
          className: input.className,
          id: input.id,
          visible: input.offsetParent !== null
        });
      });

      // Find checkboxes specifically
      document.querySelectorAll('input[type="checkbox"], [role="checkbox"]').forEach((cb, i) => {
        result.checkboxes.push({
          index: i,
          checked: cb.checked || cb.getAttribute('aria-checked') === 'true',
          className: cb.className,
          id: cb.id,
          parentText: cb.parentElement?.textContent?.substring(0, 100),
          visible: cb.offsetParent !== null
        });
      });

      // Find buttons
      document.querySelectorAll('button, [role="button"]').forEach((btn, i) => {
        result.buttons.push({
          index: i,
          text: btn.textContent?.substring(0, 50),
          className: btn.className,
          visible: btn.offsetParent !== null
        });
      });

      // Find elements with click handlers or interactive elements
      const clickable = document.querySelectorAll('[onclick], [class*="click"], [class*="btn"], [class*="button"]');
      clickable.forEach((el, i) => {
        if (i < 20) { // Limit output
          result.interactiveElements.push({
            tag: el.tagName,
            className: el.className,
            text: el.textContent?.substring(0, 50)
          });
        }
      });

      // Find specific text content we're looking for
      const searchTerms = ['Search for places', 'Most Recent Events', 'events found', 'Address'];
      searchTerms.forEach(term => {
        const elements = Array.from(document.querySelectorAll('*')).filter(
          el => el.textContent?.includes(term) && el.children.length === 0
        );
        if (elements.length > 0) {
          result.textContent.push({
            searchTerm: term,
            found: elements.length,
            firstElement: {
              tag: elements[0].tagName,
              className: elements[0].className,
              fullText: elements[0].textContent?.substring(0, 100)
            }
          });
        }
      });

      return result;
    });

    console.log('URL:', debug.url);
    console.log('\nInputs found:', debug.inputs.length);
    debug.inputs.forEach(inp => {
      if (inp.visible) {
        console.log(`  [${inp.index}] type=${inp.type} placeholder="${inp.placeholder}" class="${inp.className?.substring(0, 50)}"`);
      }
    });

    console.log('\nCheckboxes found:', debug.checkboxes.length);
    debug.checkboxes.forEach(cb => {
      console.log(`  [${cb.index}] checked=${cb.checked} visible=${cb.visible} parent="${cb.parentText?.substring(0, 50)}"`);
    });

    console.log('\nRelevant text elements:');
    debug.textContent.forEach(tc => {
      console.log(`  "${tc.searchTerm}": found ${tc.found} times`);
      console.log(`    First: <${tc.firstElement.tag}> class="${tc.firstElement.className}"`);
    });

    console.log('\n=== END DEBUG ===\n');

    return debug;
  }

  /**
   * Wait for page data to fully load (no more skeleton loaders)
   */
  async waitForDataLoad(maxWaitMs = 15000) {
    console.log('⏳ Waiting for data to load...');
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const loadState = await this.page.evaluate(() => {
        // Check for skeleton loaders
        const skeletons = document.querySelectorAll(
          '[class*="skeleton"], [class*="Skeleton"], ' +
          '[class*="loading"], [class*="Loading"], ' +
          '[class*="spinner"], [class*="Spinner"], ' +
          '[class*="placeholder"], [class*="Placeholder"]'
        );

        // Check for "0 events found" (still loading) vs actual count
        const eventCountText = document.body.textContent.match(/(\d+)\s*events?\s*found/i);
        const eventCount = eventCountText ? parseInt(eventCountText[1]) : 0;

        // Check if there are visible event cards (not just skeletons)
        const eventCards = document.querySelectorAll('[class*="event"], [class*="Event"], [class*="card"], [class*="Card"]');
        let visibleEvents = 0;
        eventCards.forEach(card => {
          if (card.offsetParent !== null && card.textContent.length > 50) {
            visibleEvents++;
          }
        });

        return {
          hasSkeletons: skeletons.length > 0,
          eventCount,
          visibleEvents
        };
      });

      console.log(`   Skeletons: ${loadState.hasSkeletons}, Events found: ${loadState.eventCount}, Visible: ${loadState.visibleEvents}`);

      // Consider loaded if:
      // 1. No skeletons AND we have events, OR
      // 2. Event count matches visible events (data is displayed)
      if (!loadState.hasSkeletons ||
          (loadState.eventCount > 0 && loadState.visibleEvents >= loadState.eventCount * 0.5)) {
        console.log('✅ Data appears to be loaded');
        return true;
      }

      await delay(1000);
    }

    console.log('⚠️ Timeout waiting for data load');
    return false;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Browser closed');
    }
  }

  /**
   * Dump captured API calls for analysis
   */
  dumpApiCalls() {
    console.log('\n📡 === CAPTURED API CALLS ===');
    console.log(`Total requests: ${this.capturedApiCalls?.length || 0}`);
    this.capturedApiCalls?.forEach((call, i) => {
      console.log(`\n[${i}] ${call.method} ${call.url}`);
      if (call.postData) {
        console.log(`    Body: ${call.postData.substring(0, 200)}...`);
      }
    });

    console.log('\n📥 === CAPTURED RESPONSES ===');
    console.log(`Total responses with data: ${this.capturedResponses?.length || 0}`);
    this.capturedResponses?.forEach((resp, i) => {
      console.log(`\n[${i}] ${resp.status} ${resp.url}`);
      if (resp.data) {
        const dataStr = JSON.stringify(resp.data);
        console.log(`    Data: ${dataStr.substring(0, 300)}...`);
      }
    });
    console.log('\n=== END API DUMP ===\n');
  }

  /**
   * Extract storm data from captured API responses
   */
  extractFromApiResponses() {
    const result = {
      events: [],
      rawApiData: []
    };

    this.capturedResponses?.forEach(resp => {
      if (resp.data) {
        result.rawApiData.push(resp);

        // Try to extract events from various response structures
        const data = resp.data;

        // Check for events array
        if (Array.isArray(data)) {
          data.forEach(item => {
            if (item.date || item.hailSize || item.windSpeed || item.type) {
              result.events.push(this.normalizeEvent(item));
            }
          });
        }

        // Check for nested events
        if (data.events && Array.isArray(data.events)) {
          data.events.forEach(item => {
            result.events.push(this.normalizeEvent(item));
          });
        }

        // Check for data.data pattern
        if (data.data && Array.isArray(data.data)) {
          data.data.forEach(item => {
            if (item.date || item.hailSize || item.windSpeed) {
              result.events.push(this.normalizeEvent(item));
            }
          });
        }

        // Check for results pattern
        if (data.results && Array.isArray(data.results)) {
          data.results.forEach(item => {
            result.events.push(this.normalizeEvent(item));
          });
        }
      }
    });

    return result;
  }

  /**
   * Normalize event data from various API formats
   */
  normalizeEvent(item) {
    return {
      date: item.date || item.eventDate || item.event_date || item.timestamp || null,
      type: item.type || item.eventType || item.event_type || 'Unknown',
      size: item.hailSize || item.hail_size || item.size || item.diameter || null,
      wind: item.windSpeed || item.wind_speed || item.wind || null,
      source: 'HailTrace API',
      raw: item
    };
  }
}

// Main execution
async function main() {
  const options = parseArgs();
  const scraper = new HailTraceScraper();

  // Apply slow mode if requested
  if (options.slowMode) {
    console.log('🐢 Slow mode enabled - extra delays will be added');
  }

  try {
    await scraper.init();
    await scraper.login();

    // Debug mode: dump page structure after login
    if (options.debug) {
      console.log('\n📍 Debug: Post-login state');
      await scraper.takeScreenshot('debug-post-login.png');
    }

    let data = null;

    if (options.address) {
      // In debug mode, analyze page before and after search
      if (options.debug) {
        // Navigate to maps first
        await scraper.page.goto(CONFIG.mapsUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
        await delay(2000);
        console.log('\n📍 Debug: Maps page structure before search');
        await scraper.debugPageStructure();
        await scraper.takeScreenshot('debug-maps-before.png');
      }

      data = await scraper.searchAddress(options.address);

      if (options.debug) {
        console.log('\n📍 Debug: Page structure after search');
        await scraper.debugPageStructure();
      }
    } else if (options.lat && options.lng) {
      data = await scraper.searchCoordinates(options.lat, options.lng);
    } else {
      // Default: just login and take screenshot
      await scraper.page.goto(CONFIG.mapsUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
      await delay(2000);
      await scraper.takeScreenshot('hailtrace-dashboard.png');

      if (options.debug) {
        await scraper.debugPageStructure();
      }

      console.log('ℹ️ No search parameters provided. Use --address or --lat/--lng');
      console.log('   Tip: Use --debug to analyze the page structure');
    }

    // Always dump API calls in debug mode
    if (options.debug) {
      scraper.dumpApiCalls();
    }

    // Try to extract from API responses if DOM extraction failed
    if (data && data.events.length === 0 && scraper.capturedResponses?.length > 0) {
      console.log('🔄 Attempting extraction from captured API responses...');
      const apiData = scraper.extractFromApiResponses();
      if (apiData.events.length > 0) {
        data.events = apiData.events;
        data.rawApiData = apiData.rawApiData;
        console.log(`✅ Extracted ${apiData.events.length} events from API responses`);
      }
    }

    if (data) {
      // Output results
      console.log('\n📋 Results:');
      console.log(JSON.stringify(data, null, 2));

      // Save to file
      const outputDir = path.resolve(CONFIG.outputDir);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filename = `hailtrace-data-${Date.now()}.json`;
      fs.writeFileSync(path.join(outputDir, filename), JSON.stringify(data, null, 2));
      console.log(`\n💾 Data saved to: ${path.join(outputDir, filename)}`);

      if (options.downloadReport) {
        await scraper.downloadReport(options.address);
      }

      // Take final screenshot
      await scraper.takeScreenshot(`hailtrace-${Date.now()}.png`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await scraper.takeScreenshot('hailtrace-error.png');

    if (options.debug) {
      console.log('\n📍 Debug: Error state analysis');
      try {
        await scraper.debugPageStructure();
      } catch (e) {
        console.log('Could not debug:', e.message);
      }
    }

    process.exit(1);
  } finally {
    await scraper.close();
  }
}

main();
