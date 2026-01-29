# Susan Hail Lookup via Chat Feature

## Overview

Susan can now automatically look up hail and storm data when you ask about storm dates for a specific address in the chat interface.

## Implementation Details

**File Modified:** `/Users/a21/gemini-field-assistant/components/ChatPanel.tsx`

### New Functions Added

1. **detectHailLookupRequest(input: string)** - Detects if user is asking for hail/storm data
2. **parseAddress(rawAddress: string)** - Extracts street, city, state, zip from address string
3. **formatHailResponseForUser(results, address)** - Formats results for user-friendly display
4. **formatHailResultsForSusan(results, address)** - Stores formatted context for future reference

### How It Works

1. User types a hail lookup query in chat (e.g., "What storm dates for 123 Main St, Dallas, TX 75201?")
2. System detects the query pattern and extracts the address
3. Calls `hailMapsApi.searchByAddress()` with parsed address components
4. Formats and displays results in chat
5. Stores context in localStorage for Susan to reference in future messages

## Supported Query Patterns

Susan recognizes these patterns:
- "What storm dates do we have for [address]?"
- "Look up hail history for [address]"
- "Check storms at [address]"
- "Any hail events at [address]?"
- "Storm history for [address]"
- "Hail data for [address]"

## Address Format

Addresses should follow this format:
```
123 Main St, City, ST 12345
```

Components:
- **Street:** Street number and name
- **City:** City name
- **State:** Two-letter state code (VA, MD, PA, etc.)
- **Zip:** 5-digit zip code (optional, defaults to 00000 if not provided)

## Example Queries

### Query 1
```
User: "What storm dates do we have for 1 S Bonsall Ave, Glenolden, PA 19036?"
```

**Expected Response:**
```markdown
## Storm History for 1 S Bonsall Ave, Glenolden, PA 19036

Found **5 storm events** in the past 24 months:

### Interactive Hail Maps Data
- **2025-07-26**: Hail 0.5"
- **2025-05-15**: Hail 0.5"

### ✓ NOAA Certified Data
*Official government source - legally defensible for insurance claims*

- **2025-06-12**: Wind (56 knots)
  *Tree damage reported near intersection...*
- **2024-08-30**: Hail (1.0 inches)

---
Would you like me to:
- Generate an adjuster email with these storm dates?
- Look up another address?
- Download a full report?
```

### Query 2
```
User: "Check hail events for 456 Oak Ave, Norman, OK 73019"
```

**Expected Response:**
- If events found: Formatted list with NOAA and IHM data
- If no events: Clear message explaining no events found with suggestions

### Query 3
```
User: "Look up storms at 789 Elm St, Fairfax, VA 22030"
```

**Expected Response:**
- Searches past 24 months
- Displays all hail and wind events
- Prioritizes NOAA certified data

## Error Handling

If the lookup fails:
```
I attempted to look up hail data for **[address]**, but encountered an error: [error message].

Please verify the address format (e.g., "123 Main St, City, ST 12345") and try again.
```

Common errors:
- Invalid address format
- API timeout
- Network connectivity issues

## localStorage Context

After a successful lookup, the system stores the results in localStorage:

```javascript
localStorage.setItem('susan_hail_context', formattedContext);
```

This allows Susan to reference the storm dates in subsequent messages, especially when generating emails.

## Integration with Email Generation

The stored hail context is automatically included in the system prompt when generating emails:

```typescript
const hailContext = localStorage.getItem('susan_hail_context');
if (hailContext) {
  systemPrompt += `\n\nHAIL HISTORY CONTEXT:\n${hailContext}\nUse these documented storm dates and hail sizes when relevant, especially for adjuster emails.`;
}
```

## Testing

### Manual Test 1: Basic Lookup
1. Open chat interface
2. Type: "What storm dates for 1 S Bonsall Ave, Glenolden, PA 19036?"
3. Verify: Results display with NOAA and IHM data
4. Check: localStorage has 'susan_hail_context' key

### Manual Test 2: No Results
1. Type: "Check storms at 123 Fake St, NoCity, ZZ 99999"
2. Verify: Clear "no events found" message
3. Verify: Helpful suggestions provided

### Manual Test 3: Invalid Address
1. Type: "Look up hail for not-a-valid-address"
2. Verify: Error message with format guidance

### Manual Test 4: Email Integration
1. Look up storm dates for an address
2. Type: "Generate an email to the adjuster about these storms"
3. Verify: Email includes the storm dates from lookup

## Backend Requirements

Ensure backend hail API is running:
- Endpoint: `GET /hail/search?street=X&city=Y&state=Z&zip=W&months=24`
- Returns: `HailSearchResult` with events, noaaEvents, totalCount

## Production Deployment

1. Build: `npm run build`
2. Commit: Changes already committed to git
3. Push: Automatically deploys to Railway
4. Verify: Test on production URL

## Files Modified

- `/Users/a21/gemini-field-assistant/components/ChatPanel.tsx`
  - Added imports for `hailMapsApi`
  - Added 4 new helper functions
  - Modified `handleSendMessage` to detect and handle hail queries

## Next Steps

Potential enhancements:
1. Add visual map display of storm events
2. Support radius searches (e.g., "storms within 5 miles of address")
3. Add date range filtering (e.g., "storms in last 12 months")
4. Download PDF report directly from chat
5. Bulk address lookup support

---

**Status:** ✅ Implemented and deployed
**Commit:** 4b5d716
**Date:** January 29, 2026
