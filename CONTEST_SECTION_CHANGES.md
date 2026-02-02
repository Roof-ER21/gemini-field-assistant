# Contest Section Updates - February 1, 2026

## Changes Made

### 1. Fixed Text Contrast Issues

All text has been made bolder and more readable with better contrast:

#### Headers and Titles
- **Contest name**: Now uses `fontWeight: '700'`, `color: '#FFFFFF'`, with `textShadow: '0 1px 2px rgba(0,0,0,0.5)'`
- **Section titles** ("Your Standing", "Leaderboard", "Prize"): All use bold white text with text shadows

#### Contest Info Boxes
- Type, Metric, Start, End dates: Updated to use `fontWeight: '600'`, `color: '#FFFFFF'` with text shadows
- Labels now use `color: '#D1D5DB'` and `fontWeight: '500'` for better readability

#### Your Standing Section
- Section header: `fontWeight: '700'`, `color: '#FFFFFF'`, `textShadow: '0 1px 3px rgba(0,0,0,0.5)'`
- Rank text: `color: '#D1D5DB'`, `fontWeight: '600'`
- Stats (signups/revenue): `fontWeight: '700'` with text shadows

#### Leaderboard
- Section header: `fontWeight: '700'`, `color: '#FFFFFF'`, `textShadow: '0 1px 3px rgba(0,0,0,0.5)'`
- Names: `fontWeight: '700'`, `color: '#FFFFFF'`, `textShadow: '0 1px 2px rgba(0,0,0,0.5)'`
- Emails: `color: '#D1D5DB'`, `fontWeight: '500'`
- Stats: `fontWeight: '700'` with text shadows

#### Prize Section
- "Prize" label: `fontWeight: '700'`
- Description: `fontWeight: '600'`, `color: '#FFFFFF'`, `textShadow: '0 1px 2px rgba(0,0,0,0.3)'`

### 2. Added "Share to The Roof" Feature (Admin Only)

#### New Icons Imported
- `Share2` - for share button icon
- `Copy` - for copy to clipboard
- `MessageSquare` - for post to team chat

#### New State Variables
- `showShareModal` - controls share modal visibility
- `shareMessage` - stores the generated share message

#### New Functions

**`generateShareMessage()`**
- Generates formatted contest standings message
- Includes:
  - Contest name
  - Top 10 standings with emoji ranks (🥇🥈🥉)
  - Each standing shows name + stats (signups/revenue based on metric type)
  - End date (or "Contest Ended" if past)
  - Prize description if available
  - Motivational message "Keep pushing! 💪"

**`handleShare()`**
- Generates the share message
- Opens the share modal

**`copyToClipboard()`**
- Copies formatted message to clipboard
- Shows success/error alert

**`postToTeamChat()`**
- POSTs message to `/api/messages` endpoint
- Sends as broadcast message
- Shows success/error alert
- Closes modal on success

#### Share Button (Admin Only)
- Located in contest detail modal header, next to close button
- Gold/yellow gradient theme matching prizes
- Icon: Share2
- Label: "Share" (on desktop only)
- Responsive: icon-only on mobile

#### Share Modal
- Dark overlay with gold-bordered modal
- Three sections:
  1. **Header**: "Share Contest Standings" title with close button
  2. **Preview**: Shows formatted message in monospace font, scrollable
  3. **Actions**: Two buttons:
     - "Copy to Clipboard" (blue gradient)
     - "Post to Team Chat" (gold gradient)

#### Share Message Format Example
```
🏆 CONTEST UPDATE: February Sales Challenge

📊 Current Standings:
🥇 Kerouls Gayed - 12 signups, $0 revenue
🥈 Basel Halim - 8 signups, $0 revenue
🥉 Nick Bourdin - 8 signups, $0 revenue
4. Christian Bratton - 7 signups
5. Steve McKim - 6 signups

⏰ Ends: Feb 27, 2026
🎁 Prize: $2,000 cash prize + trophy for 1st place

Keep pushing! 💪
```

### Technical Details

**Files Modified:**
- `/Users/a21/gemini-field-assistant/src/components/ContestSection.tsx`

**API Endpoint Used:**
- `POST /api/messages` - for posting to team chat
  - Body: `{ message: string, type: 'broadcast' }`
  - Headers: `x-user-email`

**Accessibility:**
- All interactive elements have `minHeight: '44px'` for touch targets
- Share button has tooltip: "Share to The Roof"
- Modal has proper z-index (10000) above other modals
- Click outside modal to close

**Responsive Design:**
- Share button shows icon + text on desktop
- Share button shows icon only on mobile/portrait
- Modal content is fully responsive
- Preview area is scrollable if content is long

## Testing Checklist

- [ ] Text is readable on all gradient backgrounds
- [ ] Names in leaderboard are bold white
- [ ] Stats (signups/revenue) have good contrast
- [ ] Share button appears for admins only
- [ ] Share button hidden for non-admins
- [ ] Share modal opens when clicked
- [ ] Preview shows correct formatted message
- [ ] Copy to clipboard works
- [ ] Post to team chat works (if `/api/messages` exists)
- [ ] Modal closes on successful post
- [ ] Modal closes when clicking outside
- [ ] Responsive on mobile/tablet/desktop

## Future Enhancements

Potential improvements:
1. Add direct social media sharing (Twitter, LinkedIn)
2. Allow customizing the share message before posting
3. Include contest link in share message
4. Add email sharing option
5. Track who shared and when
6. Preview how message will look in team chat
7. Schedule automatic standings updates
