/**
 * HailTrace Direct API Client
 *
 * Directly queries HailTrace's GraphQL API for storm data
 * Much faster and more reliable than browser automation
 *
 * Usage:
 *   node hailtrace-api.js                    # Get recent events
 *   node hailtrace-api.js --start 2024-01-01 # Filter by date
 *   node hailtrace-api.js --min-hail 1.5     # Filter by hail size
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const GRAPHQL_ENDPOINT = 'https://app-graphql.hailtrace.com/graphql';

// Get credentials from environment
const getCredentials = () => {
  const email = process.env.HAILTRACE_EMAIL;
  const password = process.env.HAILTRACE_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing credentials. Set HAILTRACE_EMAIL and HAILTRACE_PASSWORD');
  }

  return { email, password };
};

// Parse command line arguments
const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    startDate: null,
    endDate: null,
    minHail: null,
    limit: 100,
    page: 0,
    debug: false,
    output: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--start':
        options.startDate = args[++i];
        break;
      case '--end':
        options.endDate = args[++i];
        break;
      case '--min-hail':
        options.minHail = parseFloat(args[++i]);
        break;
      case '--limit':
        options.limit = parseInt(args[++i]);
        break;
      case '--page':
        options.page = parseInt(args[++i]);
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--help':
      case '-h':
        console.log(`
HailTrace API Client - Direct GraphQL Access

Usage:
  node hailtrace-api.js [options]

Options:
  --start <date>       Start date (YYYY-MM-DD), default: 1 year ago
  --end <date>         End date (YYYY-MM-DD), default: today
  --min-hail <inches>  Filter events with hail >= this size
  --limit <number>     Max events to fetch (default: 100)
  --page <number>      Page number for pagination (default: 0)
  --output, -o <file>  Output file path (default: auto-generated)
  --debug              Enable debug output
  --help, -h           Show this help

Environment Variables:
  HAILTRACE_EMAIL      Your HailTrace login email
  HAILTRACE_PASSWORD   Your HailTrace password
  HAILTRACE_OUTPUT_DIR Output directory for exports

Examples:
  node hailtrace-api.js
  node hailtrace-api.js --start 2024-01-01 --min-hail 1.0
  node hailtrace-api.js --limit 500 --output storms.json
`);
        process.exit(0);
    }
  }

  // Set default dates if not provided
  if (!options.startDate) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    options.startDate = oneYearAgo.toISOString().split('T')[0];
  }
  if (!options.endDate) {
    options.endDate = new Date().toISOString().split('T')[0];
  }

  return options;
};

class HailTraceAPI {
  constructor() {
    this.token = null;
    this.userId = null;
    this.userInfo = null;
  }

  async graphqlRequest(query, variables = {}, requiresAuth = true) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://app.hailtrace.com',
      'Referer': 'https://app.hailtrace.com/'
    };

    if (requiresAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    return data;
  }

  async login() {
    const { email, password } = getCredentials();
    console.log(`🔐 Logging in as ${email}...`);

    const query = `
      mutation Authenticate($input: AuthenticationInput!) {
        authenticate(input: $input) {
          message
          session {
            token
          }
        }
      }
    `;

    const variables = {
      input: {
        email,
        password,
        type: 'BASIC',
        deviceType: 'WEB'
      }
    };

    const result = await this.graphqlRequest(query, variables, false);

    if (result.data?.authenticate?.session?.token) {
      this.token = result.data.authenticate.session.token;
      console.log('✅ Login successful');

      // Get user info
      await this.getUserInfo();
      return true;
    }

    throw new Error('Login failed: ' + JSON.stringify(result));
  }

  async getUserInfo() {
    const query = `
      query SessionUser {
        sessionUser {
          _id
          firstName
          lastName
          email
          enabledWeatherTypes
          company {
            _id
            name
          }
        }
      }
    `;

    const result = await this.graphqlRequest(query);

    if (result.data?.sessionUser) {
      this.userId = result.data.sessionUser._id;
      this.userInfo = result.data.sessionUser;
      console.log(`👤 User: ${result.data.sessionUser.firstName} ${result.data.sessionUser.lastName}`);
      console.log(`🏢 Company: ${result.data.sessionUser.company?.name}`);
      console.log(`🌦️ Weather Types: ${result.data.sessionUser.enabledWeatherTypes?.join(', ')}`);
    }

    return result.data?.sessionUser;
  }

  async getWeatherEvents(options = {}) {
    const { startDate, endDate, limit = 100, page = 0 } = options;

    console.log(`🌩️ Fetching weather events (${startDate} to ${endDate})...`);

    const query = `
      query FilterWeatherEvents($input: FilterWeatherEventsInput!) {
        filterWeatherEvents(input: $input) {
          page
          total
          results {
            id
            types
            eventDate
            maxAlgorithmHailSize
            maxMeteorologistHailSize
            maxMeteorologistWindSpeedMPH
            maxMeteorologistWindStarLevel
          }
        }
      }
    `;

    const variables = {
      input: {
        page,
        limit,
        startDate,
        endDate
      }
    };

    const result = await this.graphqlRequest(query, variables);

    if (result.errors) {
      console.error('GraphQL Errors:', result.errors);
      return null;
    }

    return result.data?.filterWeatherEvents;
  }

  async getLatestWeatherEvent() {
    const query = `
      query {
        getLatestWeatherEvent {
          id
          types
          eventDate
          maxAlgorithmHailSize
          maxMeteorologistHailSize
          maxMeteorologistWindSpeedMPH
        }
      }
    `;

    const result = await this.graphqlRequest(query);
    return result.data?.getLatestWeatherEvent;
  }

  async getAllEvents(options = {}) {
    const { startDate, endDate, minHail, limit = 100 } = options;

    let allEvents = [];
    let page = 0;
    let hasMore = true;
    const pageSize = Math.min(limit, 100);

    while (hasMore && allEvents.length < limit) {
      const result = await this.getWeatherEvents({
        startDate,
        endDate,
        limit: pageSize,
        page
      });

      if (!result || !result.results) {
        break;
      }

      allEvents = allEvents.concat(result.results);
      console.log(`   Page ${page}: ${result.results.length} events (total so far: ${allEvents.length}/${result.total})`);

      hasMore = result.results.length === pageSize && allEvents.length < result.total;
      page++;

      // Respect rate limits
      if (hasMore) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Filter by minimum hail size if specified
    if (minHail) {
      allEvents = allEvents.filter(e => {
        const hail = e.maxAlgorithmHailSize || e.maxMeteorologistHailSize || 0;
        return hail >= minHail;
      });
      console.log(`   Filtered to ${allEvents.length} events with hail >= ${minHail}"`);
    }

    return allEvents.slice(0, limit);
  }
}

// Main execution
async function main() {
  const options = parseArgs();
  const api = new HailTraceAPI();

  try {
    await api.login();

    // Get latest event
    console.log('\n📍 Latest weather event:');
    const latest = await api.getLatestWeatherEvent();
    if (latest) {
      console.log(`   Date: ${latest.eventDate}`);
      console.log(`   Types: ${latest.types?.join(', ')}`);
      console.log(`   Hail: ${latest.maxAlgorithmHailSize || latest.maxMeteorologistHailSize || 'N/A'}"`);
      console.log(`   Wind: ${latest.maxMeteorologistWindSpeedMPH || 'N/A'} mph`);
    }

    // Get events for date range
    console.log(`\n📊 Fetching events from ${options.startDate} to ${options.endDate}...`);
    const events = await api.getAllEvents({
      startDate: options.startDate,
      endDate: options.endDate,
      minHail: options.minHail,
      limit: options.limit
    });

    if (!events || events.length === 0) {
      console.log('No events found for the specified criteria.');
      return;
    }

    console.log(`\n✅ Retrieved ${events.length} events`);

    // Display summary
    console.log('\n📋 Storm Event Summary:');
    console.log('─'.repeat(60));

    // Group by month
    const byMonth = {};
    events.forEach(e => {
      const month = e.eventDate.substring(0, 7);
      if (!byMonth[month]) {
        byMonth[month] = { count: 0, maxHail: 0, maxWind: 0 };
      }
      byMonth[month].count++;
      const hail = e.maxAlgorithmHailSize || e.maxMeteorologistHailSize || 0;
      const wind = e.maxMeteorologistWindSpeedMPH || 0;
      if (hail > byMonth[month].maxHail) byMonth[month].maxHail = hail;
      if (wind > byMonth[month].maxWind) byMonth[month].maxWind = wind;
    });

    console.log('\nMonthly Summary:');
    Object.keys(byMonth).sort().forEach(month => {
      const m = byMonth[month];
      console.log(`  ${month}: ${m.count} events, max hail: ${m.maxHail}", max wind: ${m.maxWind} mph`);
    });

    // Show significant events (hail >= 1")
    const significant = events.filter(e => {
      const hail = e.maxAlgorithmHailSize || e.maxMeteorologistHailSize || 0;
      return hail >= 1.0;
    });

    if (significant.length > 0) {
      console.log(`\n🔴 Significant Events (hail >= 1"): ${significant.length}`);
      significant.slice(0, 10).forEach(e => {
        const hail = e.maxAlgorithmHailSize || e.maxMeteorologistHailSize;
        const wind = e.maxMeteorologistWindSpeedMPH;
        console.log(`  ${e.eventDate}: ${hail}" hail${wind ? `, ${wind} mph wind` : ''}`);
      });
      if (significant.length > 10) {
        console.log(`  ... and ${significant.length - 10} more`);
      }
    }

    // Prepare output data
    const outputData = {
      query: {
        startDate: options.startDate,
        endDate: options.endDate,
        minHail: options.minHail,
        limit: options.limit
      },
      user: {
        name: `${api.userInfo?.firstName} ${api.userInfo?.lastName}`,
        company: api.userInfo?.company?.name,
        enabledTypes: api.userInfo?.enabledWeatherTypes
      },
      summary: {
        totalEvents: events.length,
        significantEvents: significant.length,
        byMonth
      },
      events: events.map(e => ({
        id: e.id,
        date: e.eventDate,
        types: e.types,
        hailSize: e.maxAlgorithmHailSize || e.maxMeteorologistHailSize || null,
        hailSizeAlgorithm: e.maxAlgorithmHailSize,
        hailSizeMeteo: e.maxMeteorologistHailSize,
        windSpeed: e.maxMeteorologistWindSpeedMPH,
        windStarLevel: e.maxMeteorologistWindStarLevel
      })),
      extractedAt: new Date().toISOString()
    };

    // Save to file
    const outputDir = process.env.HAILTRACE_OUTPUT_DIR || './hailtrace-exports';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = options.output || `hailtrace-events-${Date.now()}.json`;
    const filepath = path.isAbsolute(filename) ? filename : path.join(outputDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(outputData, null, 2));
    console.log(`\n💾 Data saved to: ${filepath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (options.debug) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
