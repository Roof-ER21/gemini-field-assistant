# Storm Damage Report - Visual Guide

This document describes the visual appearance of the generated PDF reports.

## Page Layout

```
┌────────────────────────────────────────────────────────┐
│ ┌────┐                                                │
│ │SA21│  STORM DAMAGE HISTORY REPORT                   │
│ └────┘  Report ID: SR-ABC123-XYZ                      │
│         Generated: Feb 2, 2026, 11:21 PM              │
├════════════════════════════════════════════════════════┤
│                                                        │
│ PROPERTY INFORMATION                                   │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Address        │ 123 Main St, Dallas, TX 75001   │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Coordinates    │ 32.776700, -96.797000           │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Search Radius  │ 50 miles                        │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Data Sources   │ NOAA Storm Events, IHM          │ │
│ └───────────────────────────────────────────────────┘ │
│                                                        │
│ DAMAGE RISK ASSESSMENT                                 │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │                          ┌──────────┐              │ │
│ │                          │   HIGH   │              │ │
│ │         72               └──────────┘              │ │
│ │                          (Orange badge)            │ │
│ │    DAMAGE SCORE                                    │ │
│ │                                                    │ │
│ │  High risk area with 6 recorded hail events.      │ │
│ │  Maximum hail size of 2.0" indicates significant  │ │
│ │  damage potential. 3 events in past 12 months.    │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ Risk Factors:                                          │
│ ┌───────────────────────────────────────────────────┐ │
│ │ Total Events          │ 6                         │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Max Hail Size         │ 2.0"                      │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Recent Activity (12mo)│ 3                         │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Severe Events (1.5"+) │ 3                         │ │
│ ├───────────────────────────────────────────────────┤ │
│ │ Cumulative Exposure   │ 8.5                       │ │
│ └───────────────────────────────────────────────────┘ │
│                                                        │
│ EXECUTIVE SUMMARY                                      │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ • Total Storm Events: 6 events within 50 miles        │
│ • Largest Recorded Hail: 2.0"                          │
│ • Most Recent Event: May 15, 2024                      │
│ • Severe Events (1.5"+): 3 events                      │
│ • Historical Data Coverage: 2 years                    │
│                                                        │
│ STORM EVENT TIMELINE                                   │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ ┌──────┬──────┬────────┬────────┬────────┬─────────┐ │
│ │ Date │ Type │ Size   │Severity│ Source │Distance │ │
│ ├──────┼──────┼────────┼────────┼────────┼─────────┤ │
│ │May 15│ Hail │ 2.0"   │ SEVERE │  IHM   │ 2.3 mi  │ │
│ │ 2024 │      │        │  (red) │        │         │ │
│ ├──────┼──────┼────────┼────────┼────────┼─────────┤ │
│ │Apr 12│ Hail │ 1.5"   │ SEVERE │ NOAA   │ 1.5 mi  │ │
│ │ 2024 │      │        │  (red) │        │         │ │
│ ├──────┼──────┼────────┼────────┼────────┼─────────┤ │
│ │Mar 20│ Hail │ 1.25"  │MODERATE│  IHM   │ 1.8 mi  │ │
│ │ 2024 │      │        │(yellow)│        │         │ │
│ ├──────┼──────┼────────┼────────┼────────┼─────────┤ │
│ │Aug 5 │ Wind │ 70 mph │MODERATE│ NOAA   │ 2.0 mi  │ │
│ │ 2023 │      │        │(yellow)│        │         │ │
│ ├──────┼──────┼────────┼────────┼────────┼─────────┤ │
│ │Jun 10│ Hail │ 1.75"  │ SEVERE │  IHM   │ 3.1 mi  │ │
│ │ 2023 │      │        │  (red) │        │         │ │
│ ├──────┼──────┼────────┼────────┼────────┼─────────┤ │
│ │May 22│ Hail │ 1.0"   │MODERATE│ NOAA   │ 4.2 mi  │ │
│ │ 2022 │      │        │(yellow)│        │         │ │
│ └──────┴──────┴────────┴────────┴────────┴─────────┘ │
│                                                        │
│                                      (continues...)    │
├════════════════════════════════════════════════════════┤
│ Generated by SA21 Storm Intelligence      Page 1      │
│ John Smith • (555) 123-4567 • john@example.com        │
│ CONFIDENTIAL - For insurance and property assessment  │
└────────────────────────────────────────────────────────┘
```

## Page 2+ (if needed)

```
┌────────────────────────────────────────────────────────┐
│ STORM EVENT TIMELINE (continued)                       │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ ┌──────┬──────┬────────┬────────┬────────┬─────────┐ │
│ │ Date │ Type │ Size   │Severity│ Source │Distance │ │
│ ├──────┼──────┼────────┼────────┼────────┼─────────┤ │
│ │ ...  │ ...  │  ...   │  ...   │  ...   │  ...    │ │
│ └──────┴──────┴────────┴────────┴────────┴─────────┘ │
│                                                        │
│ EVIDENCE FOR INSURANCE CLAIMS                          │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ This report contains official storm event data from    │
│ certified sources:                                     │
│                                                        │
│ 1. NOAA Storm Events Database - The National Oceanic  │
│    and Atmospheric Administration maintains the        │
│    official record of severe weather events in the     │
│    United States. All NOAA data in this report is      │
│    sourced directly from their certified database      │
│    and represents verified storm events.               │
│                                                        │
│ 2. Interactive Hail Maps (IHM) - A professional-grade │
│    storm tracking service that aggregates data from    │
│    multiple verified sources including NEXRAD radar,   │
│    NOAA reports, and ground observations.              │
│                                                        │
│ This data is suitable for insurance claims and roof    │
│ damage assessments. The information contained herein   │
│ represents the best available historical storm data    │
│ for the specified location.                            │
│                                                        │
│ IMPORTANT: This report provides historical storm data  │
│ only. Physical roof inspection by a qualified          │
│ professional is required to determine actual damage.   │
│                                                        │
│ ┌────────────────────────────────────────────────────┐ │
│ │ DISCLAIMER: This report is provided for            │ │
│ │ informational purposes only. While every effort    │ │
│ │ has been made to ensure accuracy, storm data is    │ │
│ │ based on historical records and may not capture    │ │
│ │ all weather events. This report does not           │ │
│ │ constitute a roof inspection or damage assessment. │ │
│ │ Professional inspection required for insurance.    │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│                                                        │
├════════════════════════════════════════════════════════┤
│ Generated by SA21 Storm Intelligence      Page 2      │
│ John Smith • (555) 123-4567 • john@example.com        │
│ CONFIDENTIAL - For insurance and property assessment  │
└────────────────────────────────────────────────────────┘
```

## Color Scheme

### Risk Level Colors
- **Critical (76-100)**: Red (#dc2626)
- **High (51-75)**: Orange (#f97316)
- **Moderate (26-50)**: Yellow (#eab308)
- **Low (0-25)**: Green (#22c55e)

### Brand Colors
- **Primary**: Navy Blue (#1e3a8a) - Headers, borders
- **Secondary**: Slate Gray (#475569) - Text
- **Accent**: Sky Blue (#0ea5e9) - Section dividers
- **Text Dark**: Dark Slate (#1e293b)
- **Text Light**: Light Slate (#64748b)
- **Border**: Border Gray (#cbd5e1)

## Typography

- **Headers**: Helvetica-Bold, 14-24pt
- **Body Text**: Helvetica, 10-11pt
- **Table Text**: Helvetica, 8-9pt
- **Footer**: Helvetica, 7-8pt
- **Disclaimers**: Helvetica-Oblique, 7-8pt

## Design Elements

### 1. Logo/Badge
```
┌────┐
│SA21│  (Blue circle with white text)
└────┘
```

### 2. Risk Level Badge
```
┌──────────┐
│   HIGH   │  (Orange background, white text, rounded corners)
└──────────┘
```

### 3. Score Display
```
    72          (Large, colored number)

DAMAGE SCORE    (Small gray text below)
```

### 4. Tables
- Alternating row colors (white / light gray)
- Borders on all cells
- Header row with navy blue background
- White text in headers

### 5. Info Boxes
- Light background with colored left border
- Padding around text
- Used for property info and risk factors

### 6. Disclaimer Box
- Light gray background
- Gray border
- Italic text
- Smaller font size

## Spacing and Margins

- **Page Margins**: 50pt all sides
- **Section Spacing**: 1.5-2 line breaks
- **Table Row Height**: 20-25pt
- **Header Spacing**: 0.8 line breaks after divider

## Professional Features

1. **Unique Report ID**: SR-[timestamp]-[random] format
2. **Page Numbers**: "Page X" on every page
3. **Rep Contact Info**: Centered in footer if provided
4. **Confidentiality Notice**: On every page
5. **Auto-pagination**: Tables split across pages cleanly
6. **Consistent Branding**: SA21 logo and colors throughout

## Comparison to Industry Standards

This report design follows:
- ✅ Insurance industry best practices
- ✅ Professional inspection report formatting
- ✅ NOAA data citation requirements
- ✅ Legal disclaimer standards
- ✅ Corporate branding guidelines

## Mobile/Print Optimization

- **Letter Size**: 8.5" x 11" (standard US)
- **Print-Ready**: Professional quality output
- **Email-Safe**: Compact file size (~8-15KB)
- **Screen Readable**: Clear fonts, good contrast

## Accessibility

- High contrast text
- Large, readable fonts
- Color coding with text labels (not color-only)
- Logical reading order
- Clear section headers

---

**This visual guide describes the PDF output. To see an actual example, run:**
```bash
npx tsx server/services/test-pdf-report.ts
open test-storm-report.pdf
```
