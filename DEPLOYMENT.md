# S21 Field Assistant - Production Deployment Guide

## Deployment Summary

**Status**: Successfully Deployed to Vercel
**Production URL**: https://gemini-field-assistant-6hucmzobz-ahmedmahmoud-1493s-projects.vercel.app
**Platform**: Vercel
**Build Size**: 5.7MB (includes 2.5MB knowledge base documents)
**Framework**: React + Vite + TypeScript

---

## Current Status

- Application deployed and live
- 123 knowledge base documents included in build
- Static file serving configured for markdown documents
- Environment variables need to be configured in Vercel dashboard

---

## Environment Variables Configuration

### Required Environment Variable

The application requires the following environment variable to function:

**Variable Name**: `GEMINI_API_KEY`
**Description**: Google Gemini API key for AI functionality

### How to Set Environment Variables in Vercel

#### Option 1: Vercel Dashboard (Recommended)

1. Visit the Vercel project dashboard:
   - Go to https://vercel.com/dashboard
   - Select the `gemini-field-assistant` project

2. Navigate to Settings:
   - Click on "Settings" tab
   - Select "Environment Variables" from the left sidebar

3. Add the environment variable:
   - Variable Name: `GEMINI_API_KEY`
   - Value: `your_actual_gemini_api_key_here`
   - Environment: Select "Production", "Preview", and "Development"
   - Click "Save"

4. Redeploy the application:
   ```bash
   cd /Users/a21/Desktop/gemini-field-assistant
   vercel --prod
   ```

#### Option 2: Vercel CLI

```bash
# Set environment variable via CLI
vercel env add GEMINI_API_KEY production

# When prompted, enter your Gemini API key
# Then redeploy
vercel --prod
```

#### Option 3: Using the .env.local file (Local Development Only)

Update `/Users/a21/Desktop/gemini-field-assistant/.env.local`:
```
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

**Note**: This file is git-ignored and only works locally. Production uses Vercel's environment variables.

---

## Getting a Gemini API Key

If you don't have a Gemini API key yet:

1. Visit: https://aistudio.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated key
5. Add it to Vercel environment variables (see above)

---

## Project Structure

```
/Users/a21/Desktop/gemini-field-assistant/
├── public/
│   ├── extracted_content/      # 123 knowledge base documents (2.5MB)
│   └── docs/                    # Legacy folder (can be removed)
├── src/
│   ├── components/              # React components
│   ├── services/
│   │   ├── geminiService.ts    # Gemini API integration
│   │   └── knowledgeService.ts # Knowledge base with semantic search
│   ├── App.tsx                 # Main app component
│   └── index.tsx               # Entry point
├── dist/                        # Production build (5.7MB)
├── .env.example                 # Example environment variables
├── .env.local                   # Local environment (git-ignored)
├── vercel.json                  # Vercel configuration
└── vite.config.ts              # Vite build configuration
```

---

## Knowledge Base

The application includes a comprehensive knowledge base with 123 documents:

### Document Categories (10 Categories)

1. **Adjuster Resources** (2 documents)
2. **Agreements & Contracts** (9 documents)
3. **Branding** (1 document)
4. **Company Culture** (2 documents)
5. **Customer Resources** (13 documents)
6. **Email Templates** (11 documents)
7. **Financial** (1 document)
8. **Insurance Arguments** (15 documents)
9. **Licenses & Certifications** (18 documents)
10. **Miscellaneous** (27 documents)
11. **Operations** (1 document)
12. **Procedures** (1 document)
13. **Quick Reference** (2 documents)
14. **Reference** (8 documents)
15. **Sales Scripts** (7 documents)
16. **Training** (5 documents)

### How Documents Are Served

All documents are stored in `/public/extracted_content/` and are:
- Served as static files by Vite
- Accessible at `/extracted_content/[path]` in production
- Loaded via fetch API in the browser
- Searchable using semantic search powered by TF-IDF

---

## Deployment Configuration

### Vercel Configuration (`vercel.json`)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Vite Configuration Highlights

- **Environment Variables**: Injected at build time via `define` config
- **API Key Access**: Available as `process.env.GEMINI_API_KEY`
- **Static Assets**: Public folder copied to dist during build
- **Port**: Development server runs on 5174

---

## Build Process

### Local Build

```bash
cd /Users/a21/Desktop/gemini-field-assistant
npm run build
```

Output:
- Build directory: `dist/`
- Bundle size: ~450KB JavaScript (gzipped: ~110KB)
- Total size with assets: 5.7MB (includes knowledge base)

### Production Build (Vercel)

Vercel automatically:
1. Installs dependencies: `npm install`
2. Runs build command: `npm run build`
3. Deploys `dist/` folder to CDN
4. Applies environment variables
5. Serves on global edge network

---

## Testing the Deployment

### 1. Basic Functionality Test

1. Visit: https://gemini-field-assistant-6hucmzobz-ahmedmahmoud-1493s-projects.vercel.app
2. Verify the app loads without errors
3. Check browser console for any errors

### 2. Knowledge Base Test

After setting the `GEMINI_API_KEY`:

1. Click "Knowledge Base" in the sidebar
2. Try searching for documents (e.g., "training", "warranty", "agreement")
3. Click on a document to load its content
4. Verify markdown content displays correctly

### 3. AI Features Test

1. Navigate to different panels (Chat, Email, Thinking, etc.)
2. Test AI interactions with Gemini
3. Verify responses are generated correctly

### 4. Performance Test

- Initial page load should be < 3 seconds
- Knowledge base search should be instant (< 100ms)
- Document loading should be < 500ms

---

## Troubleshooting

### Issue: "API Key Not Found" Error

**Solution**: Set `GEMINI_API_KEY` in Vercel dashboard and redeploy

### Issue: Knowledge Base Documents Not Loading

**Possible Causes**:
1. Check browser console for 404 errors
2. Verify paths in `/Users/a21/Desktop/gemini-field-assistant/services/knowledgeService.ts`
3. Ensure `DOCS_BASE_PATH = '/extracted_content'`

**Solution**:
```bash
# Rebuild and redeploy
npm run build
vercel --prod
```

### Issue: Build Fails on Vercel

**Common Causes**:
- Missing dependencies
- TypeScript errors
- Build command misconfiguration

**Solution**:
1. Check Vercel build logs: `vercel inspect [deployment-url] --logs`
2. Test build locally: `npm run build`
3. Fix errors and redeploy

### Issue: Slow Performance

**Possible Causes**:
- Large bundle size
- Unoptimized images
- Too many documents loaded at once

**Solution**:
1. Enable code splitting in Vite config
2. Lazy load knowledge base documents
3. Implement pagination for document lists

---

## Monitoring & Logs

### View Deployment Logs

```bash
# View build logs
vercel inspect [deployment-url] --logs

# View runtime logs
vercel logs gemini-field-assistant
```

### Vercel Analytics

Enable analytics in Vercel dashboard:
1. Project Settings > Analytics
2. Enable "Web Analytics"
3. View metrics at: https://vercel.com/[your-username]/gemini-field-assistant/analytics

---

## Updating the Deployment

### Deploy New Changes

```bash
cd /Users/a21/Desktop/gemini-field-assistant

# Make your changes, then:
git add .
git commit -m "Your commit message"
vercel --prod
```

### Update Environment Variables

```bash
# Update via CLI
vercel env rm GEMINI_API_KEY production
vercel env add GEMINI_API_KEY production

# Or update via Vercel dashboard
```

### Rollback to Previous Deployment

```bash
# List previous deployments
vercel ls

# Promote a previous deployment
vercel promote [deployment-url]
```

---

## Custom Domain Setup (Optional)

### Add Custom Domain

1. Go to Vercel Dashboard > Project Settings > Domains
2. Click "Add Domain"
3. Enter your domain (e.g., `s21-field-assistant.com`)
4. Follow DNS configuration instructions

### SSL Certificate

Vercel automatically provisions SSL certificates for:
- Default Vercel domains (`.vercel.app`)
- Custom domains (via Let's Encrypt)

---

## Security Considerations

### Environment Variables

- Never commit `.env.local` to git (already in `.gitignore`)
- Use Vercel's encrypted environment variable storage
- Rotate API keys regularly

### API Key Protection

- API key is only exposed in the browser (client-side app)
- Consider implementing a backend proxy for production use
- Rate limit API calls to prevent abuse

### Content Security

- Knowledge base documents are publicly accessible
- Ensure no sensitive information in markdown files
- Use authentication if needed (requires backend)

---

## Cost Estimation

### Vercel Free Tier Limits

- **Bandwidth**: 100GB/month
- **Build Time**: 6000 minutes/month
- **Deployments**: Unlimited
- **Serverless Functions**: 100GB-Hours

### Expected Usage (Estimated)

- **Bandwidth**: ~6MB per user visit (5.7MB app + assets)
- **Max Users**: ~16,000 users/month on free tier
- **Build Time**: ~30 seconds per deployment

For higher traffic, upgrade to Vercel Pro ($20/month).

---

## Backup & Recovery

### Backup Repository

```bash
# Clone repository for backup
git clone /Users/a21/Desktop/gemini-field-assistant /path/to/backup

# Or push to GitHub
cd /Users/a21/Desktop/gemini-field-assistant
git remote add origin https://github.com/your-username/gemini-field-assistant.git
git push -u origin main
```

### Export Knowledge Base

Knowledge base is already stored in:
- `/Users/a21/Desktop/gemini-field-assistant/public/extracted_content/`
- Original source: `/Users/a21/Desktop/extracted_content/`

---

## Next Steps

### Immediate Actions Required

1. **Set Gemini API Key** in Vercel Dashboard
2. **Test Application** at production URL
3. **Verify Knowledge Base** functionality

### Recommended Improvements

1. **Add Custom Domain** for better branding
2. **Enable Analytics** to track usage
3. **Implement Caching** for knowledge base documents
4. **Add Error Tracking** (e.g., Sentry)
5. **Create Backend API** to protect API keys
6. **Add User Authentication** if needed
7. **Implement Document Upload** feature
8. **Add Export/PDF Generation** for documents

---

## Support & Resources

### Documentation

- Vite: https://vitejs.dev/
- React: https://react.dev/
- Vercel: https://vercel.com/docs
- Gemini API: https://ai.google.dev/docs

### Commands Quick Reference

```bash
# Local development
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Deploy to Vercel
vercel --prod

# View logs
vercel logs

# Check deployment status
vercel ls
```

---

## Deployment History

| Date | Action | URL | Status |
|------|--------|-----|--------|
| 2025-10-26 | Initial Deployment | https://gemini-field-assistant-6hucmzobz-ahmedmahmoud-1493s-projects.vercel.app | Success |

---

**Deployed by**: Claude Code (Senior Deployment Engineer)
**Date**: October 26, 2025
**Version**: 1.0.0
**Status**: Production Ready (pending API key configuration)
