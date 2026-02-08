# Presentation System - Quick Start Guide

## For Developers

### 1. Create an Inspection with Photos

```bash
# Create inspection
curl -X POST http://localhost:5000/api/inspections \
  -H "Content-Type: application/json" \
  -H "x-user-email: inspector@company.com" \
  -d '{
    "property_address": "123 Main St",
    "customer_name": "John Doe",
    "roof_type": "Asphalt Shingle",
    "roof_age": 15
  }'

# Response: { "inspection": { "id": "inspection-uuid", ... } }
```

### 2. Upload Photos

```bash
# Upload photo (base64 encoded)
curl -X POST http://localhost:5000/api/inspections/INSPECTION_ID/photos \
  -H "Content-Type: application/json" \
  -H "x-user-email: inspector@company.com" \
  -d '{
    "photo_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "file_name": "roof-damage.jpg",
    "category": "damage",
    "notes": "Visible hail damage on north slope"
  }'

# Response: { "photo": { "id": "photo-uuid", ... } }
```

### 3. Run AI Analysis

```bash
# Analyze all photos
curl -X POST http://localhost:5000/api/inspections/INSPECTION_ID/analyze \
  -H "x-user-email: inspector@company.com"

# Response: { "analyzed_count": 5 }
```

### 4. Generate Presentation

```bash
# Create presentation
curl -X POST http://localhost:5000/api/presentations \
  -H "Content-Type: application/json" \
  -H "x-user-email: inspector@company.com" \
  -d '{
    "inspection_id": "INSPECTION_ID",
    "title": "Roof Inspection - 123 Main St",
    "presentation_type": "insurance",
    "branding": {
      "company_name": "ABC Roofing",
      "contact_info": "555-1234",
      "logo_url": "https://example.com/logo.png"
    }
  }'

# Response: { "presentation": { "id": "presentation-uuid", ... } }
```

### 5. Share Presentation

```bash
# Generate public share link
curl -X POST http://localhost:5000/api/presentations/PRESENTATION_ID/share \
  -H "x-user-email: inspector@company.com"

# Response: {
#   "share_url": "http://localhost:5000/api/present/abc123xyz789",
#   "share_token": "abc123xyz789"
# }
```

### 6. Access Public Presentation

```bash
# Open in browser
http://localhost:5000/present/abc123xyz789

# Or use the share_url directly
http://localhost:5000/api/present/abc123xyz789
```

## For End Users (Inspectors)

### Creating and Sharing a Presentation

1. **Complete Inspection:**
   - Navigate to Inspection Panel
   - Upload roof photos (drag & drop or click)
   - Add notes and categorize photos
   - Click "Analyze with AI" button

2. **Generate Presentation:**
   - Wait for AI analysis to complete
   - Click "Generate Presentation"
   - Review generated slides
   - Edit if needed

3. **Share with Customer:**
   - Click "Share Presentation"
   - Copy the generated link
   - Send via email, text, or any messaging app
   - Track when customer views it

### Customer Experience

1. **Receive Link:**
   - Customer gets link via email/text
   - Example: `https://app.theroofdocs.com/present/xyz789`

2. **View Presentation:**
   - Click link (no login required)
   - See professional slide presentation
   - Navigate with arrows or keyboard
   - Auto-play available

3. **Ask Questions:**
   - Click "Ask Susan AI" button
   - Type questions about the inspection
   - Get instant, helpful answers
   - Context-aware responses

## Common Use Cases

### Use Case 1: Insurance Claim Documentation

```
Inspector workflow:
1. Photo damaged areas
2. Run AI analysis
3. Generate "insurance" presentation type
4. Share with homeowner
5. Homeowner shares with adjuster
```

### Use Case 2: Maintenance Recommendations

```
Inspector workflow:
1. Photo entire roof
2. Document minor issues
3. Generate "standard" presentation
4. Include maintenance recommendations
5. Share with property owner
```

### Use Case 3: Emergency Assessment

```
Inspector workflow:
1. Quick photo survey after storm
2. Prioritize critical issues
3. Generate "detailed" presentation
4. Mark urgent items
5. Share immediately with customer
```

## API Endpoints Summary

### Authenticated Endpoints (Require x-user-email header)

```
POST   /api/inspections                      - Create inspection
GET    /api/inspections/:id                  - Get inspection
POST   /api/inspections/:id/photos           - Upload photo
GET    /api/inspections/:id/photos           - List photos
POST   /api/inspections/:id/analyze          - Run AI analysis

POST   /api/presentations                    - Create presentation
GET    /api/presentations/:id                - Get presentation
PUT    /api/presentations/:id                - Update presentation
POST   /api/presentations/:id/share          - Generate share link
```

### Public Endpoints (No authentication)

```
GET    /api/present/:token                   - View presentation
POST   /api/present/:token/analytics         - Track view session
POST   /api/susan/chat                       - Susan AI responses
```

## Environment Variables

### Required (Backend)

```bash
# AI Provider
GEMINI_API_KEY=your-google-ai-key

# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# Server
PORT=5000
NODE_ENV=production
```

### Optional

```bash
# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000

# Analytics
ENABLE_ANALYTICS=true

# Branding
DEFAULT_COMPANY_NAME="The Roof Docs"
DEFAULT_LOGO_URL="https://..."
```

## Troubleshooting

### Presentation Not Loading

**Symptom:** Blank screen or "Presentation not found"

**Solutions:**
1. Check share token is correct
2. Verify presentation is marked `is_public: true`
3. Check browser console for errors
4. Test in incognito mode (clear cache)

```bash
# Verify presentation status
curl http://localhost:5000/api/present/YOUR_TOKEN
```

### Susan AI Not Responding

**Symptom:** "I'm having trouble responding..."

**Solutions:**
1. Check GEMINI_API_KEY is set
2. Verify API key has credits
3. Check backend logs for errors
4. Fallback responses should still work

```bash
# Test API key
curl -X POST http://localhost:5000/api/susan/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'
```

### Photos Not Displaying

**Symptom:** Broken image icons

**Solutions:**
1. Verify base64 encoding is correct
2. Check MIME type is included
3. Ensure photo_data has data URL prefix
4. Check browser console for 413 errors (too large)

```javascript
// Correct format
"photo_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."

// Incorrect (missing prefix)
"photo_data": "/9j/4AAQSkZJRg..."
```

### Slow Presentation Loading

**Symptom:** Long load times

**Solutions:**
1. Optimize photo sizes before upload
2. Limit photos per inspection (< 20)
3. Use image compression
4. Check network speed

```bash
# Check presentation size
curl -I http://localhost:5000/api/present/YOUR_TOKEN
# Look for Content-Length header
```

## Testing Checklist

### Before Deploying

- [ ] Create test inspection
- [ ] Upload 3+ photos
- [ ] Run AI analysis successfully
- [ ] Generate presentation
- [ ] Share presentation (get token)
- [ ] View as public user (incognito)
- [ ] Test Susan AI chat
- [ ] Test keyboard navigation
- [ ] Test mobile responsive
- [ ] Test auto-play
- [ ] Verify analytics tracking

### Performance Testing

```bash
# Load test public endpoint
ab -n 100 -c 10 http://localhost:5000/api/present/YOUR_TOKEN

# Expected: < 200ms average response time
```

## Security Checklist

- [ ] Share tokens are 20+ characters
- [ ] Presentations default to `is_public: false`
- [ ] No PII in analytics logs
- [ ] Rate limiting enabled on AI endpoints
- [ ] HTTPS enforced in production
- [ ] CORS configured correctly
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS prevention (React escaping)

## Browser Support

### Fully Supported
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Mobile
- iOS Safari 14+
- Chrome Android 90+
- Samsung Internet 14+

### Known Issues
- IE 11: Not supported (use modern browser)
- Safari < 14: Some CSS features may not work

## Support Resources

### Documentation
- Architecture: `/docs/PRESENTATION_ARCHITECTURE.md`
- Update Log: `/PRESENTATION_VIEWER_UPDATE.md`
- This Guide: `/docs/PRESENTATION_QUICK_START.md`

### Code References
- Presenter: `/components/inspection/InspectionPresenterV2.tsx`
- Susan AI: `/components/inspection/SusanAISidebar.tsx`
- Public Viewer: `/src/present/PresentationViewer.tsx`
- API Routes: `/server/routes/inspectionPresentationRoutes.ts`

### Getting Help
1. Check browser console for errors
2. Review server logs
3. Test with curl commands above
4. Verify environment variables
5. Check database connection

---

**Quick Start Version:** 1.0
**Last Updated:** February 8, 2025
