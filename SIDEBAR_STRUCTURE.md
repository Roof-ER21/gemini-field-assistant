# Sidebar Navigation Structure

## Visual Layout

```
┌─────────────────────────────────────┐
│    GEMINI FIELD ASSISTANT           │
│    [Notification Bell]              │
├─────────────────────────────────────┤
│                                     │
│  Navigation                         │
│  ───────────                        │
│                                     │
│  ▼ ✨ Main                   [open] │
│    ├─ 🏠 Home                       │
│    │   Dashboard                    │
│    └─ 🔺 Chat                       │
│        AI conversation              │
│                                     │
│  ▼ 👥 Team                   [open] │
│    ├─ 👥 Team                  (3)  │ ← Badge count
│    │   Message colleagues           │
│    ├─ 🏆 Leaderboard                │
│    │   Sales rankings               │
│    └─ 📈 Learning                   │
│        Team feedback                │
│                                     │
│  ▶ 🔧 Tools              [collapsed]│
│                                     │
│  ▶ 🏗️ Field Ops         [collapsed]│
│                                     │
│  ▶ ☁️ Storm Intel        [collapsed]│
│                                     │
│  ▶ 📻 Other              [collapsed]│
│                                     │
├─────────────────────────────────────┤
│  Quick Actions                      │
│  ─────────────                      │
│                                     │
│  [📧 Email]                         │
│  Quick email draft                  │
│                                     │
│  [🎤 Voice Note]                    │
│  Record & transcribe                │
│                                     │
│  [📤 Upload]                        │
│  Quick file upload                  │
│                                     │
└─────────────────────────────────────┘
```

## Expanded View - Tools Category

```
  ▼ 🔧 Tools                      [open]
    ├─ 📧 Email
    │   Generate emails
    ├─ 🎤 Transcription
    │   Voice to text
    ├─ 🖼️ Upload Analysis
    │   Docs & photos review
    └─ 📚 Knowledge Base
        Documents & guides
```

## Expanded View - Field Ops Category

```
  ▼ 🏗️ Field Ops                 [open]
    ├─ 💼 Jobs
    │   Manage your jobs
    ├─ 📍 Territories
    │   Manage sales areas
    └─ 📍 Canvassing
        Track door knocking
```

## Expanded View - Storm Intel Category

```
  ▼ ☁️ Storm Intel                [open]
    ├─ ☁️ Storm Map
    │   Hail history by region
    ├─ 🏢 Hail & Insurance
    │   Hail history + directory
    └─ ⚠️ Impacted Assets
        Customer storm alerts
```

## Expanded View - Other Category

```
  ▼ 📻 Other                      [open]
    ├─ 📻 Live
    │   Real-time mode
    └─ 🛡️ Admin Panel         [admin only]
        System settings
```

## Category Grouping Logic

### Main (Always Visible, Default: Expanded)
Core navigation items used daily:
- Home - Dashboard overview
- Chat - AI assistant interaction

### Team (Always Visible, Default: Expanded)
Team collaboration and performance:
- Team - Internal messaging (shows unread count badge)
- Leaderboard - Sales rankings
- Learning - Team feedback and training

### Tools (Default: Collapsed)
Utility features for daily tasks:
- Email - Email generation
- Transcription - Voice-to-text conversion
- Upload Analysis - Document/photo analysis
- Knowledge Base - Documentation repository

### Field Ops (Default: Collapsed)
Field sales operations:
- Jobs - Job management
- Territories - Territory assignment
- Canvassing - Door-to-door tracking

### Storm Intel (Default: Collapsed)
Storm and hail tracking features:
- Storm Map - Regional hail history
- Hail & Insurance - Hail reports and carrier directory
- Impacted Assets - Customer property alerts

### Other (Default: Collapsed)
Additional features:
- Live - Real-time mode (feature flagged)
- Admin Panel - System settings (admin users only)

## Feature Flag Behavior

Categories automatically adjust based on feature flags:
- If all items in a category are disabled → category hidden
- If some items disabled → category shows only enabled items
- Empty categories are filtered out

## Interaction States

### Category Header
- **Default**: Gray background, white icon/text
- **Hover**: Lighter background, red border hint
- **Active**: Scale down slightly (0.98)
- **Expanded**: Chevron points down (▼)
- **Collapsed**: Chevron points right (▶)

### Nav Items
- **Default**: Gradient background, subtle border
- **Hover**: Lighter gradient, red border, translate right 4px
- **Active**: Red background, red border
- **Indentation**: 1.5rem from left when in category

## Animation Details

### Category Expand/Collapse
- **Duration**: 300ms
- **Timing**: ease-in-out
- **Properties**: max-height, opacity
- **Max Height**: 1000px (expanded), 0px (collapsed)
- **Opacity**: 1 (expanded), 0 (collapsed)

### Category Header Click
- **Duration**: 200ms
- **Timing**: ease
- **Transform**: scale(0.98) on active

## Accessibility

- ✅ Keyboard navigation (Enter/Space to toggle)
- ✅ Screen reader support (expand/collapse state announced)
- ✅ Focus indicators on category headers
- ✅ ARIA attributes (aria-expanded, aria-controls)
- ✅ Semantic HTML structure

## Mobile Behavior

On mobile (< 768px):
- Sidebar slides in from left
- Categories work identically
- Touch-friendly header height (min 48px)
- Smooth animations preserved
- Auto-close sidebar on item selection (existing behavior)

## Badge Display

Badges appear on individual items within categories:
```
Team (3)  ← Badge shows on item, not category header
  └─ Messages colleagues
```

Location: Top-right of item icon
Style: Red circle with white text
Display: Shows count (max "99+")
