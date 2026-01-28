# ROOFER S21 - App Store Screenshot Specifications

## Overview

This document provides specifications for creating App Store screenshots for the ROOFER S21 iOS app submission.

---

## Required Screenshot Sizes

### iPhone Display Sizes (Required)

| Display | Resolution | Aspect Ratio | Required |
|---------|------------|--------------|----------|
| **6.7" (iPhone 15 Pro Max, 14 Pro Max)** | 1290 x 2796 px | 9:19.5 | Yes (Primary) |
| **6.5" (iPhone 14 Plus, 13 Pro Max, 12 Pro Max)** | 1284 x 2778 px | 9:19.5 | Yes |
| **5.5" (iPhone 8 Plus, 7 Plus, 6s Plus)** | 1242 x 2208 px | 9:16 | Yes |

### iPad Display Sizes (If supporting iPad)

| Display | Resolution | Required |
|---------|------------|----------|
| 12.9" iPad Pro (6th gen) | 2048 x 2732 px | Optional |
| 11" iPad Pro (4th gen) | 1668 x 2388 px | Optional |

### Notes
- All screenshots must be PNG or JPEG format
- No alpha channel (transparency) allowed
- Maximum 10 screenshots per device size
- Minimum 1 screenshot required per supported device

---

## App Color Scheme

### Primary Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| **Background Dark** | `#111111` | Primary background |
| **Card Dark** | `#1a1a1a` | Card/panel backgrounds |
| **Red Accent** | `#dc2626` | Primary accent, CTA buttons, highlights |
| **Red Hover** | `#b91c1c` | Button hover states |
| **Text Primary** | `#ffffff` | Main text |
| **Text Secondary** | `#a0a0a0` | Secondary/muted text |
| **Border** | `#333333` | Borders and dividers |

### Gradient Background
```css
background: linear-gradient(to bottom, #111111, #1a1a1a);
```

---

## Screenshots to Capture

### Screenshot 1: Home Dashboard
**Screen:** Main dashboard after login
**Elements to Show:**
- ROOFER S21 logo header
- Quick action buttons (Susan AI, Email Generator, etc.)
- Recent activity or stats cards
- Dark theme with red accents

**Suggested Caption:**
> "Your AI-Powered Roofing Command Center"

**Alternative Captions:**
- "All Your Tools in One Place"
- "Smart Dashboard for Roofing Pros"

---

### Screenshot 2: Susan AI Chat
**Screen:** Active conversation with Susan AI assistant
**Elements to Show:**
- Chat interface with message bubbles
- Susan's responses with helpful roofing advice
- Message input area
- Clear AI assistant branding

**Suggested Caption:**
> "Meet Susan - Your 24/7 AI Sales Assistant"

**Alternative Captions:**
- "Instant Answers from Your AI Expert"
- "AI That Understands Roofing"

---

### Screenshot 3: Email Generator
**Screen:** Email composition with AI assistance
**Elements to Show:**
- Email type selection or active email draft
- AI-generated content preview
- Send/copy action buttons
- Professional email formatting

**Suggested Caption:**
> "Professional Emails in Seconds"

**Alternative Captions:**
- "AI Writes Your Follow-ups"
- "Never Struggle with Emails Again"

---

### Screenshot 4: Jobs Management
**Screen:** Jobs list or job detail view
**Elements to Show:**
- List of roofing jobs with status indicators
- Job details (customer, address, status)
- Progress tracking elements
- Quick action buttons

**Suggested Caption:**
> "Track Every Job from Start to Finish"

**Alternative Captions:**
- "Organized Job Management"
- "Never Lose Track of a Project"

---

### Screenshot 5: Knowledge Base
**Screen:** Knowledge base / training materials
**Elements to Show:**
- Categories or article list
- Search functionality
- Educational content preview
- Professional roofing resources

**Suggested Caption:**
> "Expert Knowledge at Your Fingertips"

**Alternative Captions:**
- "Built-in Training & Resources"
- "Learn from the Pros"

---

### Screenshot 6: Team Messaging
**Screen:** Team chat or messaging interface
**Elements to Show:**
- Conversation threads
- Team member presence indicators
- Message history
- Real-time communication features

**Suggested Caption:**
> "Stay Connected with Your Team"

**Alternative Captions:**
- "Real-Time Team Communication"
- "Instant Team Updates"

---

## Screenshot Design Guidelines

### Layout Recommendations

#### Option A: Device Frame with Text Overlay
```
+---------------------------+
|     HEADLINE TEXT         |
|     Subheadline text      |
+---------------------------+
|                           |
|    [iPhone Screenshot]    |
|    (with device frame)    |
|                           |
+---------------------------+
|   Brand color gradient    |
+---------------------------+
```

#### Option B: Full Bleed with Caption Bar
```
+---------------------------+
|                           |
|                           |
|    [Full Screenshot]      |
|    (no device frame)      |
|                           |
|                           |
+---------------------------+
|  Caption text on dark bg  |
+---------------------------+
```

#### Option C: Side-by-Side Features
```
+---------------------------+
|     FEATURE HEADLINE      |
+-------------+-------------+
|   [Screen]  |   [Screen]  |
|     #1      |     #2      |
+-------------+-------------+
|        Brand elements     |
+---------------------------+
```

### Typography

**Recommended Fonts:**
- Headlines: SF Pro Display Bold, 48-64pt
- Subheadlines: SF Pro Display Medium, 24-32pt
- Captions: SF Pro Text Regular, 18-24pt

**Text Styling:**
- White text (#ffffff) on dark backgrounds
- Red accent (#dc2626) for emphasis words
- Good contrast (minimum 4.5:1 ratio)

### Visual Elements

**Do Include:**
- ROOFER S21 logo (subtle placement)
- Consistent red accent color
- Roof iconography where appropriate
- Professional, clean layouts

**Avoid:**
- Cluttered screens
- Visible debug elements
- Test data or placeholder content
- Competitor mentions
- Pricing information (unless approved)

---

## Screenshot Capture Process

### Preparation Checklist

- [ ] Clean device with fresh app install
- [ ] Log in with demo/showcase account
- [ ] Populate with realistic sample data
- [ ] Disable notifications during capture
- [ ] Ensure full battery (or remove from status bar)
- [ ] Set time to 9:41 AM (Apple convention)
- [ ] Use light/dark mode as appropriate (dark for this app)

### Capture Methods

1. **Xcode Simulator:**
   - Cmd + S to capture
   - Export at required resolutions

2. **Physical Device:**
   - Side button + Volume Up
   - Airdrop to Mac for editing

3. **Screenshot Tool:**
   - Use Figma, Sketch, or similar
   - Create frames at exact required sizes
   - Import raw screenshots
   - Add text overlays and device frames

---

## App Store Optimization (ASO) Tips

### First Three Screenshots
The first 3 screenshots appear in search results. Prioritize:
1. **Susan AI Chat** - Highlight unique AI feature
2. **Home Dashboard** - Show comprehensive functionality
3. **Email Generator** - Demonstrate practical value

### Localization
If localizing, create separate screenshot sets for:
- English (US) - Primary
- Spanish (if applicable for market)

### A/B Testing
Consider testing variations:
- With vs. without device frames
- Different headline copy
- Different screenshot order

---

## File Naming Convention

```
roofer-s21-[device]-[screen]-[version].png

Examples:
roofer-s21-6.7inch-dashboard-v1.png
roofer-s21-6.7inch-susan-ai-v1.png
roofer-s21-6.7inch-email-gen-v1.png
roofer-s21-6.7inch-jobs-v1.png
roofer-s21-6.7inch-knowledge-v1.png
roofer-s21-6.7inch-messaging-v1.png
```

---

## Delivery Checklist

- [ ] 6.7" screenshots (minimum 3, recommended 6)
- [ ] 6.5" screenshots (minimum 3, recommended 6)
- [ ] 5.5" screenshots (minimum 3, recommended 6)
- [ ] All screenshots in PNG format
- [ ] No transparency/alpha channel
- [ ] Text is readable at thumbnail size
- [ ] Brand colors consistent across all screenshots
- [ ] No sensitive or test data visible
- [ ] Complies with Apple Human Interface Guidelines

---

## Resources

### Design Tools
- [Figma](https://figma.com) - Free design tool
- [Sketch](https://sketch.com) - Mac design app
- [Canva](https://canva.com) - Quick mockups
- [App Store Screenshot Generator](https://screenshots.pro) - Automated tool

### Apple Guidelines
- [App Store Screenshot Specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications)
- [Human Interface Guidelines - App Icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)

### Device Frames
- [Facebook Design Devices](https://design.facebook.com/toolsandresources/devices/)
- [Mockup World](https://www.mockupworld.co/free/category/iphone/)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-28 | Initial screenshot specification document |

---

*Document created for ROOFER S21 iOS App Store submission*
