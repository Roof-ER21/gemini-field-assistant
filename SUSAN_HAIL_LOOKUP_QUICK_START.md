# Susan Hail Lookup - Quick Start Guide

## What Is This?

Susan can now look up hail and storm history directly from chat. Just ask her about storm dates for any address!

## How to Use

### Simple Format

Just type a question like this in the chat:

```
What storm dates for [address]?
```

### Address Format

Use this format: `Street, City, ST 12345`

**Examples:**
- `1 S Bonsall Ave, Glenolden, PA 19036`
- `456 Oak Ave, Norman, OK 73019`
- `789 Elm St, Fairfax, VA 22030`

## Example Conversations

### Example 1: Standard Lookup

**You:**
```
What storm dates for 1 S Bonsall Ave, Glenolden, PA 19036?
```

**Susan:**
```markdown
## Storm History for 1 S Bonsall Ave, Glenolden, PA 19036

Found **5 storm events** in the past 24 months:

### Interactive Hail Maps Data
- **2025-07-26**: Hail 0.5"
- **2025-05-15**: Hail 0.5"

### ✓ NOAA Certified Data
*Official government source - legally defensible for insurance claims*

- **2025-06-12**: Wind (56 knots)
- **2024-08-30**: Hail (1.0 inches)

---
Would you like me to:
- Generate an adjuster email with these storm dates?
- Look up another address?
- Download a full report?
```

### Example 2: Generate Email After Lookup

**You:**
```
What storm dates for 123 Main St, Dallas, TX 75201?
```

**Susan:** (shows storm results)

**You:**
```
Generate an adjuster email about these storms
```

**Susan:** (creates email with storm dates automatically included)

### Example 3: Multiple Lookups

**You:**
```
Check hail for 100 Oak St, Norman, OK 73019
```

**Susan:** (shows results)

**You:**
```
Now check 200 Pine Ave, Moore, OK 73160
```

**Susan:** (shows new results, previous stored in memory)

## Query Variations That Work

All of these work:
- "What storm dates for [address]?"
- "Look up hail history for [address]"
- "Check storms at [address]"
- "Any hail events at [address]?"
- "Storm dates for [address]"
- "Hail data for [address]"
- "Check hail at [address]"
- "Storm history for [address]"

## What Data You Get

### NOAA Certified Data
- Official government source
- Legally defensible
- Includes event type (hail, wind, tornado)
- Magnitude and units
- Narrative descriptions

### Interactive Hail Maps Data
- Community-reported hail events
- Hail size measurements
- Date and location

## Time Range

- Default: **Past 24 months**
- Searches both NOAA and IHM databases
- Shows most recent events first

## After Lookup

Susan remembers the storm data and can:
1. **Generate emails** - Include storm dates automatically
2. **Answer questions** - Reference the data in follow-up questions
3. **Create reports** - Use data for claim documentation

## Troubleshooting

### No Results Found

If Susan says "no events found":
- Verify the address is correct
- Try a nearby address
- Check if the area had storms (some locations have no events)

### Error Messages

If you get an error:
- Check address format: `123 Main St, City, ST 12345`
- Ensure state code is 2 letters (VA, MD, PA, etc.)
- Include zip code when possible

### Invalid Address Format

**Wrong:**
```
123 Main Street Dallas Texas
```

**Right:**
```
123 Main St, Dallas, TX 75201
```

## Pro Tips

### Tip 1: Combined Workflow
```
1. "Check hail for [address]"
2. "Generate adjuster email"
3. Email automatically includes storm dates!
```

### Tip 2: Multiple Addresses
```
Look up several addresses in one session:
- Susan remembers the most recent lookup
- Each lookup updates the stored context
```

### Tip 3: Follow-Up Questions
```
After lookup:
- "Which event had the largest hail?"
- "What was the wind speed on June 12?"
- "Is the August hail event certified?"
```

### Tip 4: State-Specific Context
```
Set state context first (VA, MD, PA), then:
- "Check storms for 123 Main St, Richmond, VA"
- Susan applies state-specific guidance
```

## Common Use Cases

### Use Case 1: Pre-Inspection
```
Before site visit:
1. "Check storms at [job address]"
2. Review events and dates
3. Know what to expect on roof
```

### Use Case 2: Adjuster Communication
```
During claim:
1. "Storm dates for [address]"
2. "Generate adjuster email"
3. Send email with certified data
```

### Use Case 3: Claim Validation
```
Verify claim validity:
1. "Check hail for [address]"
2. Compare to homeowner's claim date
3. Confirm events match
```

### Use Case 4: Multiple Properties
```
Check several properties:
1. "Storms at 123 Main St, City, ST"
2. "Check 456 Oak Ave, City, ST"
3. Compare results across properties
```

## Integration Features

### Email Generation
- Storm dates auto-included in adjuster emails
- NOAA certification mentioned for credibility
- Dates formatted professionally

### Context Memory
- Susan remembers recent lookups
- Can reference in follow-up questions
- Persists across session

### State Awareness
- If state selected (VA/MD/PA)
- State-specific guidance applied
- Building codes referenced

## What's Next?

After lookup, Susan can help:
- Write adjuster emails
- Create claim documentation
- Answer insurance questions
- Provide state-specific advice
- Generate reports

## Need Help?

If something doesn't work:
1. Check address format
2. Verify backend is running
3. Check browser console for errors
4. Try a different address to test

---

**Quick Reference Card**

```
Format:  Street, City, ST 12345
Example: 1 S Bonsall Ave, Glenolden, PA 19036
Query:   "What storm dates for [address]?"
Time:    Past 24 months
Data:    NOAA + Interactive Hail Maps
```

**Status:** ✅ Live in Production
**Documentation:** See HAIL_LOOKUP_CHAT_FEATURE.md for technical details
