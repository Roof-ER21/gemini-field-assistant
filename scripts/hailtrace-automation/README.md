# HailTrace Automation

Automation scripts to extract storm data from your HailTrace subscription.

## Two Approaches

| Approach | Reliability | Speed | Use Case |
|----------|-------------|-------|----------|
| **API Client** (Recommended) | High | Fast | Bulk data extraction, scheduled jobs |
| Browser Scraper | Medium | Slow | PDF downloads, UI-specific features |

---

## API Client (Recommended)

Direct GraphQL API access - faster and more reliable than browser automation.

### Quick Start

```bash
# Set credentials
export HAILTRACE_EMAIL="your-email@example.com"
export HAILTRACE_PASSWORD="your-password"

# Run
node hailtrace-api.js
```

### Usage

```bash
# Get recent events (default: last year)
node hailtrace-api.js

# Filter by date range
node hailtrace-api.js --start 2024-01-01 --end 2024-12-31

# Filter by hail size (inches)
node hailtrace-api.js --min-hail 1.5

# Limit results
node hailtrace-api.js --limit 500

# Custom output file
node hailtrace-api.js --output my-storms.json

# Debug mode
node hailtrace-api.js --debug

# Show help
node hailtrace-api.js --help
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--start <date>` | Start date (YYYY-MM-DD) | 1 year ago |
| `--end <date>` | End date (YYYY-MM-DD) | Today |
| `--min-hail <inches>` | Filter events with hail >= this size | - |
| `--limit <number>` | Max events to fetch | 100 |
| `--page <number>` | Page number for pagination | 0 |
| `--output, -o <file>` | Output file path | Auto-generated |
| `--debug` | Enable debug output | false |

### Output Format

```json
{
  "query": {
    "startDate": "2024-01-01",
    "endDate": "2025-02-03",
    "minHail": 1.0,
    "limit": 100
  },
  "user": {
    "name": "John Smith",
    "company": "The Roof Docs",
    "enabledTypes": ["ALGORITHM_HAIL_SIZE", "METEOROLOGIST_HAIL_SIZE", "METEOROLOGIST_WIND_SPEED"]
  },
  "summary": {
    "totalEvents": 186,
    "significantEvents": 45,
    "byMonth": {
      "2024-06": { "count": 12, "maxHail": 2.5, "maxWind": 75 },
      "2024-07": { "count": 18, "maxHail": 4.0, "maxWind": 110 }
    }
  },
  "events": [
    {
      "id": "abc123",
      "date": "2024-07-15",
      "types": ["ALGORITHM_HAIL_SIZE", "METEOROLOGIST_HAIL_SIZE"],
      "hailSize": 2.5,
      "hailSizeAlgorithm": 2.25,
      "hailSizeMeteo": 2.5,
      "windSpeed": 65,
      "windStarLevel": 2
    }
  ],
  "extractedAt": "2025-02-03T10:00:00.000Z"
}
```

### API Details

The client authenticates via GraphQL at `https://app-graphql.hailtrace.com/graphql`.

**Authentication:**
```graphql
mutation Authenticate($input: AuthenticationInput!) {
  authenticate(input: $input) {
    message
    session { token }
  }
}
```

**Weather Events Query:**
```graphql
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
```

**Important Notes:**
- API returns events for your entire territory (not filterable by lat/lng)
- Date filtering supported via `startDate` and `endDate`
- Pagination supported via `page` and `limit`
- Results automatically paginate to fetch all available data

### Example Output

```
🔐 Logging in as marketing@example.com...
✅ Login successful
👤 User: John Smith
🏢 Company: The Roof Docs
🌦️ Weather Types: ALGORITHM_HAIL_SIZE, METEOROLOGIST_HAIL_SIZE, METEOROLOGIST_WIND_SPEED

📍 Latest weather event:
   Date: 2025-01-28
   Types: ALGORITHM_HAIL_SIZE, METEOROLOGIST_HAIL_SIZE
   Hail: 1.75"
   Wind: 45 mph

📊 Fetching events from 2024-02-03 to 2025-02-03...
🌩️ Fetching weather events (2024-02-03 to 2025-02-03)...
   Page 0: 100 events (total so far: 100/312)
   Page 1: 100 events (total so far: 200/312)
   Page 2: 100 events (total so far: 300/312)
   Page 3: 12 events (total so far: 312/312)
   Filtered to 186 events with hail >= 1"

✅ Retrieved 186 events

📋 Storm Event Summary:
────────────────────────────────────────────────────────────

Monthly Summary:
  2024-03: 8 events, max hail: 2", max wind: 65 mph
  2024-04: 15 events, max hail: 2.5", max wind: 78 mph
  2024-05: 22 events, max hail: 3", max wind: 88 mph
  2024-06: 30 events, max hail: 4", max wind: 110 mph
  ...

🔴 Significant Events (hail >= 1"): 186
  2024-06-15: 4" hail, 110 mph wind
  2024-06-20: 3.5" hail, 95 mph wind
  2024-07-03: 3" hail, 88 mph wind
  ... and 183 more

💾 Data saved to: ./hailtrace-exports/hailtrace-events-1738590123456.json
```

---

## Browser Scraper (Legacy)

Puppeteer-based browser automation for UI-specific features.

### When to Use Browser Scraper

- Downloading PDF weather history reports
- Accessing features only available through UI
- Capturing screenshots of storm maps

### Setup

```bash
# Install dependencies
npm install puppeteer

# Set credentials
export HAILTRACE_EMAIL="your-email@example.com"
export HAILTRACE_PASSWORD="your-password"
export HAILTRACE_OUTPUT_DIR="./hailtrace-exports"
```

### Usage

```bash
# Basic login test
node hailtrace-scraper.js

# Search by address
node hailtrace-scraper.js --address "123 Main St, Arlington, VA"

# Search by coordinates
node hailtrace-scraper.js --lat 38.9730 --lng -77.5144

# Download report
node hailtrace-scraper.js --address "123 Main St" --download

# Debug mode (shows page structure)
node hailtrace-scraper.js --address "123 Main St" --debug

# Run with visible browser
HAILTRACE_HEADLESS=false node hailtrace-scraper.js --address "123 Main St" --slow
```

### Command Line Options

| Option | Description |
|--------|-------------|
| `--address, -a` | Search by street address |
| `--lat` | Latitude for coordinate search |
| `--lng` | Longitude for coordinate search |
| `--territory, -t` | Search by territory name |
| `--download, -d` | Download PDF report after search |
| `--debug` | Enable debug mode |
| `--slow` | Slow mode with extra delays |

### How It Works

1. **Login** - Authenticates with HailTrace credentials
2. **Navigate to Maps** - Goes to the maps interface
3. **Enable "Search for places"** - Clicks checkbox for Google Places autocomplete
4. **Type Address** - Enters the address in the search field
5. **Select Autocomplete** - Clicks the first Google Places suggestion
6. **Extract Data** - Parses storm events from results

### Troubleshooting

**Checkbox Not Clicking:**
- Run with `--debug` to see page structure
- Run with `HAILTRACE_HEADLESS=false` to watch the browser
- Check screenshots in output directory

**Autocomplete Not Appearing:**
- Verify checkbox was enabled (check `after-checkbox.png`)
- Address might need to be more specific

**No Data Extracted:**
- Check `after-search.png` for search results
- Check `rawPageData.hasSkeletonLoaders` - if true, data still loading

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HAILTRACE_EMAIL` | Login email (required) | - |
| `HAILTRACE_PASSWORD` | Login password (required) | - |
| `HAILTRACE_HEADLESS` | Set to 'false' to show browser (scraper only) | true |
| `HAILTRACE_OUTPUT_DIR` | Directory for exports | ./hailtrace-exports |

---

## Integration with SA21

The exported JSON can be imported into SA21's storm map:

1. Run API client to export storm data
2. Import service watches export directory
3. Data appears in Storm Map panel
4. Susan AI can reference storm history

Future enhancements:
- Scheduled exports via cron
- Real-time sync to SA21 database
- Damage score calculation from HailTrace data

---

## Status

### API Client
- [x] Login/Authentication
- [x] User info retrieval
- [x] Weather event queries
- [x] Date range filtering
- [x] Hail size filtering
- [x] Pagination support
- [x] JSON export with summary
- [ ] Location-based filtering (not supported by API)

### Browser Scraper
- [x] Login working
- [x] Navigate to maps page
- [x] Multiple checkbox clicking strategies
- [x] Address typing with autocomplete
- [x] Google Places autocomplete selection
- [x] Storm data extraction
- [x] Debug mode
- [ ] PDF report download (partial)
