# Presentation Redesign - Testing Checklist

## Pre-Deployment Testing

### Build Verification
- [x] `npm run build` completes successfully
- [x] No TypeScript errors
- [x] Frontend bundle created in `/dist`
- [x] Server compiled successfully

### Visual Inspection (Run `npm run dev` first)

#### 1. Cover Slide
- [ ] Blue gradient background displays correctly
- [ ] Shield icon is visible and white
- [ ] Title "Roof Inspection Report" is large (56px) and bold
- [ ] Property address displays correctly
- [ ] Date shows in correct format
- [ ] Company name badge appears if userProfile.company exists

#### 2. Photo Slides
- [ ] Photo takes up 85%+ of screen
- [ ] Black background around photo
- [ ] Severity badge appears in top-left corner with correct color:
  - [ ] Red for CRITICAL
  - [ ] Orange for SEVERE
  - [ ] Yellow for MODERATE
  - [ ] Green for MINOR
- [ ] Damage type label appears at bottom-center in large text (32px)
- [ ] "CLAIM ELIGIBLE" badge shows in top-right only when insuranceRelevant=true
- [ ] NO paragraphs or bullet points visible

#### 3. Summary Slide
- [ ] Large total number displays (72px)
- [ ] "Areas of Concern" text appears below number
- [ ] Color-coded severity boxes display:
  - [ ] Critical issues (red box)
  - [ ] Severe issues (orange box)
  - [ ] Moderate issues (yellow box)
- [ ] Each box shows large number (48px) inside
- [ ] Severity labels appear below boxes in uppercase
- [ ] NO paragraphs or detailed text

#### 4. Recommendations Slide
- [ ] Green gradient background displays
- [ ] 4 icon boxes appear in 2x2 grid:
  - [ ] Green checkmark - "FILE CLAIM"
  - [ ] Blue document - "FREE INSPECTION"
  - [ ] Purple shield - "APPROVED"
  - [ ] Orange alert - "ACT NOW"
- [ ] Icons are large (64px) and visible
- [ ] Text below icons is uppercase and bold
- [ ] One CTA sentence appears at bottom
- [ ] NO numbered lists or detailed recommendations

#### 5. CTA Slide
- [ ] Blue gradient background displays
- [ ] "Let's Get Started" headline is huge (80px)
- [ ] Rep name displays if userProfile.name exists
- [ ] Phone number shows in large contact card with phone icon
- [ ] Email shows in contact card with email icon
- [ ] Three trust badges appear at bottom:
  - [ ] GAF CERTIFIED with checkmark
  - [ ] LICENSED with shield
  - [ ] INSURED with checkmark
- [ ] All badges have white icons and text

### Functional Testing

#### Navigation
- [ ] Right arrow advances to next slide
- [ ] Left arrow goes to previous slide
- [ ] Space bar advances to next slide
- [ ] First slide: previous button disabled
- [ ] Last slide: next button disabled
- [ ] Slide thumbnails at bottom show current slide highlighted
- [ ] Clicking thumbnails jumps to correct slide

#### Keyboard Shortcuts
- [ ] Press `F` toggles fullscreen mode
- [ ] Press `S` toggles Susan AI sidebar
- [ ] Press `ESC` exits presentation (or exits fullscreen first)
- [ ] Play/pause button works for auto-advance
- [ ] Progress bar updates as slides advance

#### Responsive Design
- [ ] Slides look good on 1920x1080 display
- [ ] Slides look good on 1366x768 display (common projector)
- [ ] Text remains readable at distance
- [ ] Images scale properly on different screen sizes

### Content Validation

#### Data Binding
- [ ] propertyAddress shows on cover slide
- [ ] userProfile.company shows on cover slide (if exists)
- [ ] userProfile.name shows on CTA slide (if exists)
- [ ] userProfile.phone shows on CTA slide (if exists)
- [ ] userProfile.email shows on CTA slide (if exists)
- [ ] Photo slides show correct images from photoBase64 or photo URL
- [ ] Severity levels map correctly to colors
- [ ] Insurance relevance shows correct badge

#### Edge Cases
- [ ] Slides work when userProfile is missing/null
- [ ] Slides work when optional fields are empty
- [ ] Photo slides work without analysis data
- [ ] Summary slide works with zero findings
- [ ] Recommendations slide shows default icons

### Performance Testing
- [ ] Slides transition smoothly (no lag)
- [ ] Large photos load quickly
- [ ] Auto-play advances at correct intervals (8 seconds)
- [ ] No memory leaks during extended use
- [ ] Sidebar toggle is instant

### Browser Compatibility
- [ ] Chrome (latest)
- [ ] Safari (latest)
- [ ] Firefox (latest)
- [ ] Edge (latest)

### Mobile/Tablet Testing
- [ ] iPad landscape mode
- [ ] iPad portrait mode
- [ ] Large Android tablet

---

## User Acceptance Testing

### Sales Rep Feedback
- [ ] Rep can easily talk while presenting (not reading slides)
- [ ] Photos are large enough to point at specific damage
- [ ] Severity colors create urgency without being overwhelming
- [ ] Contact info on CTA slide is readable and professional
- [ ] Trust badges increase credibility
- [ ] Overall flow helps close deals

### Homeowner Feedback (if possible)
- [ ] Slides are easy to understand
- [ ] Damage is clearly visible in photos
- [ ] Severity levels make sense
- [ ] Next steps are clear
- [ ] Not overwhelmed by text

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests above passed
- [ ] No console errors in browser
- [ ] No 404 errors for images/assets
- [ ] Environment variables set correctly
- [ ] Database migrations run (if needed)

### Deployment Steps
```bash
# 1. Final build
npm run build

# 2. Test production build locally
npm run start

# 3. Deploy (Railway example)
railway up

# 4. Verify production URL works
# 5. Test one full presentation in production
```

### Post-Deployment
- [ ] Production URL loads correctly
- [ ] All slides render properly
- [ ] Navigation works
- [ ] Keyboard shortcuts work
- [ ] No JavaScript errors in production
- [ ] Mobile/tablet access works

### Rollback Plan
```bash
# If issues arise, rollback to previous version
git log --oneline  # Find previous commit
git checkout <previous-commit-hash>
npm run build
railway up
```

---

## Known Issues / Future Enhancements

### Known Issues
- None currently

### Future Enhancements (not blocking)
1. Add fade-in animations for badges
2. Add sound effects on critical damage slides
3. Add digital signature capture on CTA slide
4. Add PDF export for homeowner takeaway
5. Add slide transitions (fade, slide, etc.)
6. Add "share via email" button
7. Add QR code on CTA slide for easy contact

---

## Testing Notes

**Tester Name:** _________________
**Date:** _________________
**Environment:** Development / Staging / Production
**Browser/Device:** _________________

**Issues Found:**
- Issue 1: _________________
- Issue 2: _________________
- Issue 3: _________________

**Overall Rating:** ⭐⭐⭐⭐⭐

**Ready for Production?** YES / NO

**Signatures:**
- Developer: _________________
- QA: _________________
- Sales Manager: _________________

---

**Last Updated:** 2026-02-08
