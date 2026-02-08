# Public Presentation Viewer - Implementation Guide

## Overview

The Public Presentation Viewer allows homeowners to view roof inspection presentations shared by sales reps without requiring login or authentication.

**Live URL Pattern**: `https://yourdomain.com/present/:shareToken`

## Features

### Core Features
- **View-Only Access**: No authentication required
- **Full-Screen Presentation**: Professional slide-based viewer
- **Mobile Responsive**: Works on all devices
- **Keyboard Navigation**: Arrow keys to navigate slides
- **Susan AI Chat**: Built-in chat widget for questions
- **Company Branding**: Displays rep's company logo and contact info
- **Analytics Tracking**: Tracks viewer sessions
- **Social Sharing**: Proper OG tags for sharing on social media

### User Experience
- Clean, professional dark theme
- Smooth slide transitions
- Visual slide indicators
- Slide counter (current/total)
- Loading states
- Error handling for invalid/expired links

## Architecture

### Frontend Files
```
/Users/a21/gemini-field-assistant/
├── present.html                          # Entry HTML file
└── src/present/
    ├── present-main.tsx                  # React entry point
    └── PresentationViewer.tsx            # Main viewer component
```

### Backend Files
```
/Users/a21/gemini-field-assistant/
└── server/
    └── routes/
        └── inspectionPresentationRoutes.ts   # API endpoints
```

## API Endpoints

### 1. GET /api/present/:token
**Public endpoint** - Fetch presentation data

**Response:**
```json
{
  "presentation": {
    "id": "uuid",
    "title": "Roof Inspection Report",
    "customer_name": "John Doe",
    "property_address": "123 Main St",
    "slides": [...],
    "branding": {
      "logo_url": "https://...",
      "company_name": "The Roof Docs",
      "contact_info": "555-1234 | info@theroofdocs.com"
    },
    "view_count": 42
  }
}
```

### 2. POST /api/present/:token/analytics
**Public endpoint** - Track viewer session

**Request:**
```json
{
  "timestamp": "2024-02-08T10:00:00Z",
  "referrer": "https://...",
  "userAgent": "Mozilla/5.0..."
}
```

**Response:**
```json
{
  "success": true
}
```

## Usage Flow

### For Sales Reps

1. **Create Inspection**
```bash
POST /api/inspections
{
  "property_address": "123 Main St",
  "customer_name": "John Doe",
  "roof_type": "Asphalt Shingle"
}
```

2. **Upload Photos**
```bash
POST /api/inspections/:id/photos
{
  "photo_data": "data:image/jpeg;base64,...",
  "category": "damage"
}
```

3. **Run AI Analysis**
```bash
POST /api/inspections/:id/analyze
```

4. **Generate Presentation**
```bash
POST /api/presentations
{
  "inspection_id": "uuid",
  "title": "Roof Inspection - John Doe",
  "branding": {
    "company_name": "The Roof Docs",
    "contact_info": "555-1234"
  }
}
```

5. **Share Presentation**
```bash
POST /api/presentations/:id/share
```

**Returns:**
```json
{
  "share_url": "https://yourdomain.com/api/present/abc123xyz456",
  "share_token": "abc123xyz456"
}
```

### For Homeowners

1. **Click shared link**: `https://yourdomain.com/present/abc123xyz456`
2. **View presentation**: Browse slides with navigation controls
3. **Ask questions**: Use Susan AI chat widget
4. **Contact rep**: Use contact info in footer

## Slide Types

### 1. Cover Slide
- **Layout**: `text-only`
- **Content**: Title, property address, inspection date

### 2. Photo Slide
- **Layout**: `split`
- **Content**: Photo + AI analysis
- **Features**:
  - Damage severity badge
  - Damage type tags
  - Affected area
  - Key insurance arguments

### 3. Analysis Slide
- **Layout**: `text-only`
- **Content**: Detailed AI analysis

### 4. Summary Slide
- **Layout**: `text-only`
- **Content**: Overall inspection summary

### 5. Recommendations Slide
- **Layout**: `text-only`
- **Content**: Numbered list of recommendations

### 6. Contact Slide
- **Layout**: `text-only`
- **Content**: Company contact information

## Navigation

### Desktop
- **Previous Button**: Navigate to previous slide
- **Next Button**: Navigate to next slide
- **Slide Indicators**: Click to jump to specific slide
- **Keyboard**: Arrow keys for navigation, Escape to close chat

### Mobile
- **Prev/Next Buttons**: Smaller buttons optimized for touch
- **Slide Counter**: Shows current/total slides
- **Slide Indicators**: Tap to navigate
- **Responsive Layout**: Stacked layout for smaller screens

## Susan AI Chat Widget

### Features
- **Quick Access**: "Ask Susan AI" button in header
- **Contextual**: Pre-loaded with presentation context
- **Full-Screen Modal**: On mobile
- **Centered Modal**: On desktop
- **Close Options**: X button, Escape key

### Integration Points
- Currently shows placeholder messages
- Ready for integration with backend chat API
- Can be connected to Susan AI service

## Branding

### Company Logo
- Displayed in header
- Falls back to initials if no logo provided

### Contact Information
- Displayed in footer
- Supports custom format (phone, email, address)

### Customization
Branding is set when creating the presentation:
```javascript
{
  "branding": {
    "logo_url": "https://example.com/logo.png",
    "company_name": "The Roof Docs",
    "contact_info": "555-1234 | info@theroofdocs.com | Baltimore, MD"
  }
}
```

## Analytics

### Tracked Metrics
- **View Count**: Incremented on each presentation load
- **Viewer Sessions**: Timestamp, referrer, user agent
- **Device Type**: Mobile vs desktop (from user agent)
- **Traffic Source**: Direct, referral, social

### Future Enhancements
Create a `presentation_views` table for detailed analytics:
```sql
CREATE TABLE presentation_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID REFERENCES presentations(id),
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  device_type TEXT,
  session_duration INTEGER,
  slides_viewed INTEGER[],
  chat_opened BOOLEAN DEFAULT false
);
```

## Security

### Access Control
- **Public Access**: No authentication required
- **Token-Based**: Only accessible with valid share token
- **Opt-In Sharing**: Presentation must be marked `is_public = true`
- **Expiration**: Can be disabled by setting `is_public = false`

### Rate Limiting
- Standard rate limiting applies (configured in server/index.ts)
- Analytics endpoint is lenient (won't block presentation load)

## Social Sharing

### Meta Tags
The presentation viewer includes proper OG tags for sharing:

```html
<meta property="og:type" content="website" />
<meta property="og:title" content="Roof Inspection Presentation" />
<meta property="og:description" content="Professional roof inspection report with AI-powered analysis" />
<meta property="og:image" content="/roofdocs-logo.png" />
```

### Twitter Card
```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Roof Inspection Presentation" />
<meta name="twitter:description" content="Professional roof inspection report with AI-powered analysis" />
<meta name="twitter:image" content="/roofdocs-logo.png" />
```

### Customization
Update meta tags in `present.html` or dynamically generate them based on presentation content.

## Development

### Local Development
```bash
cd /Users/a21/gemini-field-assistant

# Start dev server
npm run dev

# Visit presentation viewer
http://localhost:5174/present/YOUR_SHARE_TOKEN
```

### Build for Production
```bash
# Build frontend and backend
npm run build

# Start production server
npm start

# Presentation viewer will be available at
http://localhost:5000/present/YOUR_SHARE_TOKEN
```

### Testing
1. Create a test presentation via API
2. Generate share token
3. Visit `/present/:token` URL
4. Test on mobile and desktop
5. Verify keyboard navigation
6. Test Susan AI chat widget
7. Check analytics tracking

## Deployment

### Railway Deployment
The presentation viewer is automatically included in the build:

```bash
# Build command (package.json)
npm run build

# Start command (package.json)
npm start

# The build creates:
# - dist/index.html (main app)
# - dist/profile.html (public profiles)
# - dist/present.html (presentation viewer)
```

### Environment Variables
No additional environment variables required. Uses existing configuration.

### Verification
After deployment:
1. Create a test presentation
2. Share it
3. Visit the share URL
4. Verify mobile responsiveness
5. Check analytics in logs

## Customization

### Theme Colors
Edit in `present.html`:
```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#8B0000',        // Primary brand color
          dark: '#171717',       // Dark background
          light: '#f5f5f5',      // Light background
        }
      }
    }
  }
}
```

### Layout Options
Slide layouts defined in `PresentationSlide` interface:
- `full-image`: Full-screen image
- `split`: Image + text side-by-side
- `grid`: Grid layout (future)
- `text-only`: Text-only content

### Adding Features
**Example: Add PDF Export**
1. Add button to header in `PresentationViewer.tsx`
2. Create PDF generation endpoint in backend
3. Use jsPDF or server-side PDF generation
4. Return PDF download link

## Troubleshooting

### Presentation Not Loading
1. Check if share token is valid
2. Verify `is_public = true` in database
3. Check server logs for errors
4. Ensure presentation has slides

### Slides Not Displaying
1. Verify slides data structure
2. Check photo URLs are valid
3. Ensure base64 data is properly formatted
4. Check for JavaScript errors in console

### Analytics Not Tracking
1. Check network tab for failed requests
2. Verify analytics endpoint is responding
3. Check server logs
4. Note: Analytics failures are silent (won't block presentation)

### Mobile Layout Issues
1. Test on actual devices (not just browser resize)
2. Check viewport meta tag
3. Verify touch targets are large enough
4. Test keyboard navigation on iOS/Android

## Future Enhancements

### Planned Features
1. **PDF Export**: Download presentation as PDF
2. **Email Delivery**: Send presentation link via email
3. **Custom Templates**: Multiple presentation templates
4. **Video Support**: Embed video in slides
5. **Interactive Elements**: Clickable hotspots on images
6. **Offline Support**: PWA with offline viewing
7. **Presentation Analytics Dashboard**: View detailed analytics in admin panel
8. **Customer Feedback**: Inline feedback/comments
9. **Time Tracking**: Track time spent on each slide
10. **Integration with CRM**: Sync views with CRM system

### API Enhancements
1. **Webhook Notifications**: Notify when presentation is viewed
2. **Custom Expiration**: Set expiration date for presentations
3. **Password Protection**: Optional password for sensitive presentations
4. **White-Label**: Complete branding customization

## Support

For issues or questions:
1. Check server logs: `tail -f logs/server.log`
2. Review API documentation: `INSPECTION_PRESENTATION_API.md`
3. Test API endpoints: `./test-inspection-routes.js`
4. Contact development team

---

**Last Updated**: February 8, 2024
**Version**: 1.0.0
**Status**: Production Ready
