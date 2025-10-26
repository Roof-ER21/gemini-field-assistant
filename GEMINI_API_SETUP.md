# Gemini API Key Setup Guide

## Overview
This Field Assistant application requires a valid Google Gemini API key to function. All features (Chat, Transcription, Image Analysis, Live Conversation) depend on the Gemini API.

## Current Setup Status

### Environment Configuration
- **Environment File**: `.env.local` (located in project root)
- **Vite Configuration**: `vite.config.ts` loads API key as `process.env.API_KEY`
- **Service Layer**: `services/geminiService.ts` uses `process.env.API_KEY`
- **Current Key Status**: PLACEHOLDER (needs to be replaced)

### How Vite Loads the API Key
The `vite.config.ts` file:
1. Loads environment variables from `.env.local` using `loadEnv()`
2. Reads `GEMINI_API_KEY` from the environment
3. Injects it into the app as `process.env.API_KEY` via the `define` option
4. Makes it available at build time and runtime

## Step-by-Step Setup Instructions

### Step 1: Get Your Gemini API Key

1. Visit the Google AI Studio: https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click "Create API Key" or "Get API Key"
4. Copy the generated API key (it will look like: `AIzaSy...`)
5. Keep this key secure - do NOT share it or commit it to version control

### Step 2: Update Your .env.local File

Replace the placeholder with your actual API key:

```bash
# Navigate to project directory
cd /Users/a21/Desktop/gemini-field-assistant

# Update the .env.local file with your actual key
echo "GEMINI_API_KEY=AIzaSy_YOUR_ACTUAL_KEY_HERE" > .env.local
```

Or manually edit `.env.local`:
```
GEMINI_API_KEY=AIzaSy_YOUR_ACTUAL_KEY_HERE
```

**Important**: Replace `AIzaSy_YOUR_ACTUAL_KEY_HERE` with your actual API key from Step 1.

### Step 3: Verify the Setup

After updating `.env.local`, restart your development server:

```bash
# Stop the current server (Ctrl+C)
# Start it again
npm run dev
```

The server will:
- Load the new API key from `.env.local`
- Inject it as `process.env.API_KEY` in the application
- Make it available to the Gemini service layer

### Step 4: Test Each Feature

Once the server is running, test each feature:

#### 1. Chat Panel (S21 Chat)
- Click the chat icon in the sidebar
- Type a message and click "Send"
- You should receive a response from Gemini

**Expected behavior**: Bot responds with actual AI-generated text
**Error if key is invalid**: "Sorry, I encountered an error. Please try again."

#### 2. Image Analysis
- Click the image icon in the sidebar
- Upload an image file
- Enter a question about the image (e.g., "What's in this image?")
- Click "Analyze Image"

**Expected behavior**: AI provides detailed image analysis
**Error if key is invalid**: "Failed to analyze image. Please try again."

#### 3. Transcription Panel
- Click the microphone/transcription icon
- Click "Start Recording"
- Grant microphone permission if prompted
- Speak into your microphone
- Click "Stop Recording"

**Expected behavior**: Your speech appears as text
**Errors possible**:
- Invalid API key: Connection error
- No microphone access: "Mic access denied"

#### 4. Live Conversation
- Click the live conversation icon
- Click "Start Conversation"
- Grant microphone permission if prompted
- Speak to the AI and listen for responses

**Expected behavior**: Real-time voice conversation with AI responses
**Errors possible**:
- Invalid API key: "Connection error. Please try again."
- No microphone access: "Could not start live conversation"

## Features and Their API Requirements

| Feature | API Endpoint | Model Used | Requirements |
|---------|--------------|------------|--------------|
| Chat | `ai.chats.create()` | gemini-2.5-flash | Valid API key |
| Image Analysis | `ai.models.generateContent()` | gemini-2.5-flash | Valid API key + vision |
| Transcription | `ai.live.connect()` | gemini-2.5-flash-native-audio-preview | API key + microphone |
| Live Conversation | `ai.live.connect()` | gemini-2.5-flash-native-audio-preview | API key + microphone |
| Email Generation | `ai.models.generateContent()` | gemini-2.5-flash | Valid API key |
| Text Summarization | `ai.models.generateContent()` | gemini-2.5-flash | Valid API key |
| Complex Reasoning | `ai.models.generateContent()` | gemini-2.5-pro or flash | Valid API key |
| Maps Search | `ai.models.generateContent()` | gemini-2.5-flash | API key + Google Maps tool |

## Troubleshooting

### Issue: "API key not valid" error

**Solution**:
1. Verify your API key is correct in `.env.local`
2. Ensure there are no extra spaces or quotes around the key
3. Restart the development server
4. Check the browser console for detailed error messages

### Issue: Features not working after adding key

**Solution**:
1. Hard refresh the browser (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
2. Check browser console for errors
3. Verify the key has the correct permissions in Google AI Studio
4. Try regenerating the API key

### Issue: Microphone features not working

**Possible causes**:
1. Browser denied microphone permission
2. No microphone connected
3. API key issue (check chat/image features first)

**Solution**:
- Allow microphone access in browser settings
- Check browser console for specific errors
- Test chat feature first to isolate API key issues

### Issue: Environment variable not loading

**Solution**:
1. Verify `.env.local` is in the project root (same directory as `vite.config.ts`)
2. Ensure the file is named exactly `.env.local` (not `.env` or `env.local`)
3. Restart the dev server completely (kill and restart, not just refresh)
4. Check for typos: must be `GEMINI_API_KEY` exactly

## Security Best Practices

1. **Never commit your API key**: The `.env.local` file is already in `.gitignore`
2. **Rotate keys regularly**: Generate new keys periodically in AI Studio
3. **Set usage limits**: Configure API quotas in Google Cloud Console
4. **Monitor usage**: Check your API usage in AI Studio dashboard
5. **Use environment files**: Always use `.env.local` for local development

## API Key Format

A valid Gemini API key:
- Starts with `AIzaSy`
- Is 39 characters long
- Contains alphanumeric characters
- Example: `AIzaSyDaGmRTO4xpWU_gH9C69jJ0YkF2VxFwkxM` (this is fake)

## Next Steps

After successful setup:
1. Test all features to ensure they work
2. Check the browser console for any warnings
3. Review API usage in Google AI Studio
4. Consider setting up billing alerts if using paid tier

## Support Resources

- **Google AI Studio**: https://aistudio.google.com
- **Gemini API Documentation**: https://ai.google.dev/docs
- **API Key Management**: https://aistudio.google.com/apikey
- **Project Documentation**: See README.md in project root
