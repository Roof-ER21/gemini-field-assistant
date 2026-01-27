# Apple App Store Submission Checklist
## Susan AI-21 (Gemini Field Assistant)
### B2B Roofing Sales Tool with AI Features

**Last Updated:** January 2026
**App Type:** Capacitor/React Hybrid App
**Target:** iOS 14.5+ (for ATT support)

---

## Table of Contents
1. [Pre-Submission Requirements](#1-pre-submission-requirements)
2. [Technical Requirements](#2-technical-requirements)
3. [Privacy Requirements](#3-privacy-requirements)
4. [App Store Connect Metadata](#4-app-store-connect-metadata)
5. [Visual Assets](#5-visual-assets)
6. [Legal Requirements](#6-legal-requirements)
7. [AI-Specific Requirements](#7-ai-specific-requirements)
8. [Common Rejection Reasons for Capacitor Apps](#8-common-rejection-reasons-for-capacitor-apps)
9. [Authentication Requirements](#9-authentication-requirements)
10. [Push Notifications](#10-push-notifications)
11. [In-App Purchases](#11-in-app-purchases)
12. [Final Checklist](#12-final-checklist)

---

## 1. Pre-Submission Requirements

### Apple Developer Program
- [ ] Active Apple Developer Program membership ($99/year)
- [ ] Team Agent or Admin role to submit apps
- [ ] Valid App Store Connect access

### Development Environment
- [ ] **Xcode 16 or later** (Required as of April 24, 2025)
- [ ] **iOS 18 SDK** (Required for all new submissions)
- [ ] Valid signing certificates (Distribution Certificate)
- [ ] Provisioning profiles configured
- [ ] App ID registered in Apple Developer Portal

### Build Requirements
- [ ] Build with latest Capacitor version (6.x or 7.x recommended)
- [ ] No UIWebView references (use WKWebView only)
- [ ] No deprecated API usage (ITMS-90809 check)
- [ ] No non-public API usage (ITMS-90338 check)
- [ ] Minimum deployment target: iOS 14.5 (for ATT framework support)

---

## 2. Technical Requirements

### SDK and Framework Requirements
| Requirement | Status | Notes |
|------------|--------|-------|
| Xcode 16+ | Required | April 2025 mandate |
| iOS 18 SDK | Required | For App Store submissions |
| Capacitor 6/7 | Recommended | For privacy manifest support |
| WKWebView only | Required | UIWebView is deprecated/rejected |

### Info.plist Configuration
Current configuration in `/Users/a21/gemini-field-assistant-ios/ios/App/App/Info.plist`:

**Already Configured:**
- [x] `NSCameraUsageDescription` - Camera access for roof damage photos
- [x] `NSMicrophoneUsageDescription` - Voice recording and AI conversations
- [x] `NSPhotoLibraryUsageDescription` - Photo library access
- [x] `NSPhotoLibraryAddUsageDescription` - Save photos to library
- [x] `NSAppTransportSecurity` - Secure HTTPS configuration

**May Need to Add:**
- [ ] `NSUserTrackingUsageDescription` - If using ATT framework
- [ ] `NSLocationWhenInUseUsageDescription` - If adding location features
- [ ] `NSSpeechRecognitionUsageDescription` - If using on-device speech recognition

### Required Capabilities
- [ ] Push Notifications (if implemented)
- [ ] Background Modes (if needed for audio/location)
- [ ] App Groups (if sharing data between extensions)

### Device Support
- [ ] Test on iPhone (required)
- [ ] Test on iPad (if universal app)
- [ ] Verify proper scaling on all screen sizes
- [ ] Support both portrait and landscape orientations (as configured)

---

## 3. Privacy Requirements

### Privacy Policy
- [ ] **Privacy Policy URL** - Publicly accessible, always online
- [ ] Privacy policy accessible from within the app
- [ ] Privacy policy mentions "Susan AI-21" by name
- [ ] Privacy policy available in app's primary language
- [ ] Policy explains data collection, usage, and sharing
- [ ] Policy describes data retention and deletion procedures
- [ ] Policy explains how users can request data deletion

### Privacy Manifest (PrivacyInfo.xcprivacy)
**Required for apps using "Required Reason APIs":**
- [ ] Create privacy manifest file in iOS project
- [ ] Declare UserDefaults usage (if used)
- [ ] Declare file timestamp access (if used)
- [ ] Declare device identifiers (if used)
- [ ] Document all third-party SDKs and their data practices

### App Privacy Details (Nutrition Labels)
Fill out in App Store Connect:
- [ ] **Data Types Collected:**
  - [ ] Contact Info (name, email for account)
  - [ ] User Content (photos, voice recordings)
  - [ ] Usage Data (app interaction)
  - [ ] Identifiers (user ID)
  - [ ] Diagnostics (crash logs)

- [ ] **Data Usage:**
  - [ ] App Functionality
  - [ ] Analytics
  - [ ] Product Personalization

- [ ] **Data Linked to User:** Yes (account-based app)
- [ ] **Data Used for Tracking:** Specify if any

### App Tracking Transparency (ATT)
**Required if tracking users across apps/websites:**
- [ ] Implement ATT prompt if tracking
- [ ] Specify exact tracking partners (not generic language)
- [ ] Handle denial gracefully (app must work without tracking)
- [ ] Update 2025: Must name specific AI providers if sharing data

### Account Deletion Requirement
**Required if app allows account creation:**
- [ ] Account deletion available within the app
- [ ] Clear path to initiate deletion (not just "email support")
- [ ] Actually delete user data (not just deactivate)
- [ ] Confirm deletion to user

---

## 4. App Store Connect Metadata

### App Information
| Field | Limit | Content for Susan AI-21 |
|-------|-------|-------------------------|
| **App Name** | 30 chars | `Susan AI-21` or `Susan - Roofing AI` |
| **Subtitle** | 30 chars | `AI-Powered Field Assistant` |
| **Promotional Text** | 170 chars | Can update anytime without new build |
| **Description** | 4000 chars | Detailed feature description |
| **Keywords** | 100 chars | Comma-separated, no spaces after commas |
| **Support URL** | Required | Customer support page |
| **Marketing URL** | Optional | App marketing page |

### Suggested Keywords (100 character limit)
```
roofing,sales,AI,assistant,field,inspection,damage,insurance,estimate,claims,contractor,repair
```

### App Description Template
```
Susan AI-21 is your intelligent roofing field assistant, powered by Google's Gemini AI.
Designed specifically for roofing professionals, Susan helps you:

FEATURES:
- Analyze roof damage from photos using advanced AI
- Generate professional inspection reports
- Voice-powered AI conversations for hands-free operation
- Capture and organize inspection photos
- Create detailed damage assessments
- Save and review chat history
- Export professional PDF reports

PERFECT FOR:
- Roofing contractors
- Insurance adjusters
- Property inspectors
- Sales representatives

Susan AI-21 streamlines your workflow with AI-powered analysis, helping you work smarter in the field.

Requires active account. Contact your administrator for access.
```

### Category Selection
- **Primary Category:** Business
- **Secondary Category:** Productivity or Utilities

### Age Rating
Based on 2025 age rating system:
- [ ] Answer all questionnaire items
- [ ] Likely rating: **4+** (no objectionable content)
- [ ] Consider AI chatbot output when selecting rating
- [ ] Complete by January 31, 2026 deadline

---

## 5. Visual Assets

### App Icon
| Asset | Size | Format |
|-------|------|--------|
| App Store Icon | 1024 x 1024 px | PNG, no transparency |
| iPhone @2x | 120 x 120 px | PNG |
| iPhone @3x | 180 x 180 px | PNG |
| iPad | 152 x 152 px | PNG |
| iPad Pro | 167 x 167 px | PNG |

**Icon Requirements:**
- [ ] No transparency
- [ ] No rounded corners (system applies them)
- [ ] sRGB or Display P3 color space
- [ ] 2025 Update: Consider dark/tinted mode variants

### Screenshots
**Required Sizes (2025 simplified):**
- [ ] **6.9" iPhone** (1320 x 2868 px) - MANDATORY
- [ ] **13" iPad Pro** (2064 x 2752 px) - MANDATORY for iPad apps

**Screenshot Requirements:**
- [ ] 1-10 screenshots per device type
- [ ] PNG or JPEG format
- [ ] 72 dpi, no transparency
- [ ] Show actual app UI (no hands holding devices)
- [ ] Localize for each supported language

**Recommended Screenshots for Susan AI-21:**
1. Main chat interface with AI conversation
2. Photo analysis feature showing roof damage detection
3. Voice recording/transcription in action
4. Inspection report generation
5. Chat history/saved conversations
6. Dashboard or home screen

### App Preview Videos (Optional but Recommended)
- [ ] 15-30 seconds length
- [ ] Max 500 MB file size
- [ ] H.264 or ProRes 422 format
- [ ] .mov, .m4v, or .mp4 extension
- [ ] Match screenshot resolution for device

---

## 6. Legal Requirements

### Required URLs
- [ ] **Privacy Policy URL** - REQUIRED for all apps
- [ ] **Support URL** - REQUIRED
- [ ] **Terms of Service URL** - Recommended for B2B

### Copyright
- [ ] Copyright holder name
- [ ] Copyright year

### EULA (End User License Agreement)
- [ ] Use Apple's standard EULA, or
- [ ] Provide custom EULA if needed

### Content Rights
- [ ] Confirm rights to all images/icons used
- [ ] No unauthorized use of trademarks
- [ ] No use of celebrity names/likenesses without permission
- [ ] Do not use other app names (like "ChatGPT" or "Gemini") in branding

---

## 7. AI-Specific Requirements

### November 2025 AI Guidelines (Guideline 5.1.2(i))
**CRITICAL for Susan AI-21:**

- [ ] **Disclose Third-Party AI Usage:**
  - App uses Google Gemini AI
  - Must explicitly inform users data is sent to Google
  - Generic "AI service provider" language is NOT sufficient

- [ ] **Obtain Explicit User Consent:**
  - Present clear disclosure before first AI interaction
  - Explain what data is shared with Google Gemini
  - Get affirmative consent (not pre-checked boxes)

- [ ] **In-App Disclosure Example:**
```
Susan AI-21 uses Google Gemini AI to analyze photos and power conversations.
When you use these features, your queries, photos, and voice recordings are
sent to Google's servers for processing. Do you consent to this data sharing?

[Accept] [Decline]
```

- [ ] **Privacy Policy Updates:**
  - Explicitly mention Google Gemini as AI provider
  - Explain what data is sent to Gemini
  - Describe Google's data handling practices

### AI Content Safety
- [ ] Content moderation for AI responses
- [ ] Age rating considers AI-generated content
- [ ] AI doesn't generate inappropriate content
- [ ] AI clearly identified as AI (not impersonating humans)

### AI Transparency
- [ ] Users understand they're interacting with AI
- [ ] AI capabilities clearly explained
- [ ] AI limitations disclosed

---

## 8. Common Rejection Reasons for Capacitor Apps

### Technical Issues

| Issue | Solution |
|-------|----------|
| **ITMS-90338: Non-public API usage** | Update to latest Capacitor version |
| **ITMS-90809: Deprecated API (UIWebView)** | Ensure WKWebView only, update plugins |
| **ITMS-90683: Missing Purpose Strings** | Add all required usage descriptions to Info.plist |
| **Guideline 4.2.2: Minimum Functionality** | Ensure app provides more value than a website |

### How to Avoid Guideline 4.2.2 Rejection
Susan AI-21 provides native functionality beyond a website:
- [ ] Camera integration for photo capture
- [ ] Microphone for voice recording
- [ ] Photo library access
- [ ] (Future) Push notifications
- [ ] (Future) Offline capabilities
- Document these native features in review notes

### Pre-Submission Testing
- [ ] Run `npx cap doctor` to check for issues
- [ ] Archive and validate in Xcode
- [ ] Test on real iOS device (not just simulator)
- [ ] Test all permission flows
- [ ] Test app on iPad (avoid scaling issues)
- [ ] Verify no crashes on app launch

---

## 9. Authentication Requirements

### Sign in with Apple (SIWA)
**When Required:**
Apps that use third-party login (Google, Facebook, etc.) must offer:
- Sign in with Apple, OR
- A privacy-focused alternative that:
  - Limits data to name and email only
  - Allows hiding email address
  - Doesn't track users

**Current Status for Susan AI-21:**
- [ ] Review current authentication method
- [ ] If using third-party login, add SIWA or compliant alternative
- [ ] If using only your own auth system, SIWA not required

### Exceptions (SIWA Not Required):
- Apps using only company's own account system ✓
- Enterprise/business apps with existing org accounts ✓
- Educational apps with school accounts ✓

**Susan AI-21 appears to use its own auth system, so SIWA may not be required.**

---

## 10. Push Notifications

### APNs Requirements (2025 Updates)

**If implementing push notifications:**
- [ ] Use iOS 18 SDK for APNs
- [ ] Implement token-based authentication (JWT) - recommended
- [ ] Update Trust Store with USERTrust RSA Certification Authority
- [ ] Test notifications in sandbox environment
- [ ] Handle notification permissions gracefully

### Certificate Requirements
- [ ] Apple Push Notification Authentication Key (.p8) - Recommended
- [ ] OR APNs Certificate (legacy, being deprecated)

### User Permission
- [ ] Request notification permission at appropriate time
- [ ] Handle denial gracefully
- [ ] Explain value of notifications before requesting

---

## 11. In-App Purchases

### B2B App Considerations
**Good news for Susan AI-21:**

Enterprise/B2B apps sold directly to organizations can bypass IAP requirements:
- [ ] If selling directly to roofing companies → IAP not required
- [ ] If available to individual consumers → IAP required for digital goods

### 2025 Court Ruling (US Only)
- Apps can now link to external payment methods (no 27% surcharge)
- IAP still required for most consumer apps alongside external option
- Applies only to US App Store

### Current Assessment for Susan AI-21:
If this is a B2B tool distributed to roofing company employees:
- **External billing/invoicing is acceptable**
- **No IAP implementation required**
- Document B2B nature in App Review notes

---

## 12. Final Checklist

### Week Before Submission
- [ ] All features tested on physical iOS device
- [ ] Privacy policy URL live and accessible
- [ ] Support URL live and accessible
- [ ] All screenshots prepared and uploaded
- [ ] App icon in all required sizes
- [ ] Metadata completed in App Store Connect
- [ ] Privacy questionnaire completed
- [ ] Age rating questionnaire answered
- [ ] Build archived and validated in Xcode

### Day of Submission
- [ ] Upload build via Xcode or Transporter
- [ ] Select build in App Store Connect
- [ ] Complete export compliance questions
- [ ] Add App Review notes explaining:
  - B2B nature of the app
  - Test account credentials
  - Special features to test
  - Third-party AI (Gemini) usage

### App Review Notes Template
```
DEMO ACCOUNT:
Email: [demo@example.com]
Password: [password]

APP TYPE:
This is a B2B application for roofing professionals distributed
to company employees. It is not a consumer app.

NATIVE FEATURES:
- Camera integration for roof inspection photos
- Microphone for voice recording and transcription
- Photo library for saving inspection images

AI DISCLOSURE:
This app uses Google Gemini AI for photo analysis and chat
functionality. Users are presented with a disclosure and must
consent before using AI features. Full details in our privacy
policy at [URL].

SPECIAL INSTRUCTIONS:
To test AI photo analysis, take or select a photo of a roof
and tap "Analyze". For voice features, tap the microphone icon
and speak a question about roofing.
```

### Post-Submission
- [ ] Monitor App Store Connect for review status
- [ ] Respond promptly to any reviewer questions
- [ ] If rejected, carefully read rejection reason
- [ ] Fix issues and resubmit

---

## Quick Reference: Key Deadlines

| Deadline | Requirement |
|----------|-------------|
| **April 24, 2025** | Xcode 16 / iOS 18 SDK required |
| **November 13, 2025** | Third-party AI disclosure required |
| **January 31, 2026** | New age rating questionnaire responses due |

---

## Resources

### Official Apple Documentation
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Connect Help](https://developer.apple.com/help/app-store-connect/)
- [Screenshot Specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/)
- [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)

### Capacitor Documentation
- [Capacitor iOS Configuration](https://capacitorjs.com/docs/ios/configuration)

---

**Document Version:** 1.0
**Created:** January 2026
**For Project:** Susan AI-21 (Gemini Field Assistant)
