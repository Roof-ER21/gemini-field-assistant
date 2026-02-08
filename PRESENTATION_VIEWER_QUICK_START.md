# Presentation Viewer - Quick Start

## What Is It?

A public, shareable presentation page where homeowners can view roof inspection reports created by sales reps - **no login required**.

## URLs

**Development**: `http://localhost:5174/present/:token`
**Production**: `https://yourdomain.com/present/:token`

## Quick Test

### 1. Create & Share a Presentation

```bash
# Set your auth email
export USER_EMAIL="your-rep@theroofdocs.com"

# Create inspection
curl -X POST http://localhost:5000/api/inspections \
  -H "Content-Type: application/json" \
  -H "x-user-email: $USER_EMAIL" \
  -d '{
    "property_address": "123 Main St, Baltimore, MD",
    "customer_name": "John Doe",
    "roof_type": "Asphalt Shingle",
    "roof_age": 15
  }'

# Save the inspection ID, then upload a photo
curl -X POST http://localhost:5000/api/inspections/INSPECTION_ID/photos \
  -H "Content-Type: application/json" \
  -H "x-user-email: $USER_EMAIL" \
  -d '{
    "photo_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "category": "damage",
    "notes": "Wind damage on north slope"
  }'

# Run AI analysis
curl -X POST http://localhost:5000/api/inspections/INSPECTION_ID/analyze \
  -H "x-user-email: $USER_EMAIL"

# Generate presentation
curl -X POST http://localhost:5000/api/presentations \
  -H "Content-Type: application/json" \
  -H "x-user-email: $USER_EMAIL" \
  -d '{
    "inspection_id": "INSPECTION_ID",
    "title": "Roof Inspection - John Doe",
    "branding": {
      "company_name": "The Roof Docs",
      "contact_info": "555-1234 | info@theroofdocs.com"
    }
  }'

# Share the presentation
curl -X POST http://localhost:5000/api/presentations/PRESENTATION_ID/share \
  -H "x-user-email: $USER_EMAIL"

# You'll get back:
# {
#   "share_url": "http://localhost:5000/present/abc123xyz456",
#   "share_token": "abc123xyz456"
# }
```

### 2. View the Presentation

Open the `share_url` in your browser. **No login required!**

## Key Features

### Navigation
- **Desktop**: Previous/Next buttons, click slide indicators, arrow keys
- **Mobile**: Prev/Next buttons, tap indicators

### Susan AI Chat
- Click "Ask Susan AI" button in header
- Chat widget opens with context about the inspection
- Close with X button or Escape key

### Branding
- Company logo in header
- Contact info in footer
- Customizable per presentation

### Analytics
- View count incremented on each load
- Session tracking (timestamp, referrer, user agent)
- Logs in server console

## File Structure

```
/Users/a21/gemini-field-assistant/
├── present.html                      # Entry HTML
├── src/present/
│   ├── present-main.tsx              # React entry
│   └── PresentationViewer.tsx        # Main component
├── server/
│   └── routes/
│       └── inspectionPresentationRoutes.ts  # API
└── dist/                             # After build
    └── present.html                  # Built file
```

## Build & Deploy

```bash
# Development
npm run dev

# Production build
npm run build

# Start production server
npm start
```

## Common Issues

### "Presentation Not Found"
- Check share token is correct
- Verify presentation is marked `is_public = true`
- Check presentation exists in database

### Blank Page
- Run `npm run build` to create present.html
- Check dist/present.html exists
- Verify server is serving static files

### Photos Not Displaying
- Ensure photo_data includes base64 data
- Check MIME type is correct
- Verify base64 string is valid

## Next Steps

1. **Test on Mobile**: Check responsive design
2. **Customize Branding**: Update logo and colors
3. **Enable Analytics**: Set up analytics dashboard
4. **Add Features**: PDF export, email delivery, etc.

## Related Files

- `PRESENTATION_VIEWER_GUIDE.md` - Full documentation
- `INSPECTION_PRESENTATION_API.md` - API reference
- `server/routes/INSPECTION_PRESENTATION_API.md` - Detailed API docs

---

**Ready to use!** Create a presentation and share the link with homeowners.
