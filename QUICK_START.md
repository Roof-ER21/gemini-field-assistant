# Quick Start Guide - Gemini Field Assistant

## For Users in a Hurry

### Option 1: Automated Setup (Recommended)

Run the setup script:
```bash
./setup-api-key.sh
```

This will:
1. Guide you through getting an API key
2. Configure your `.env.local` file
3. Verify the setup
4. Start the development server

### Option 2: Manual Setup (2 minutes)

1. Get API key from https://aistudio.google.com/apikey

2. Create `.env.local`:
   ```bash
   echo "GEMINI_API_KEY=your_actual_key_here" > .env.local
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

4. Test it works:
   ```bash
   node verify-api-key.js
   ```

### Option 3: Copy-Paste Setup (30 seconds)

```bash
# 1. Create env file
cat > .env.local << 'EOF'
GEMINI_API_KEY=PASTE_YOUR_KEY_HERE
EOF

# 2. Start server
npm run dev
```

Then edit `.env.local` and replace `PASTE_YOUR_KEY_HERE` with your actual key from https://aistudio.google.com/apikey

## What to Test First

Once running, test in this order:

1. **Chat** - Click chat icon, type "hello", hit send
2. **Image** - Click image icon, upload a photo, ask about it
3. **Transcription** - Click mic icon, record speech
4. **Live** - Click live icon, have a voice conversation

## Common Issues

### "API key not valid"
- Double-check you copied the full key
- Ensure no spaces in `.env.local`
- Restart the dev server

### "Mic access denied"
- Allow microphone in browser settings
- Try Chrome if another browser doesn't work

### Features not working
- Run: `node verify-api-key.js`
- Check browser console (F12)
- Restart server: Kill it (Ctrl+C) then `npm run dev`

## Files You Created

- `.env.local` - Your API key (DON'T commit this!)
- `GEMINI_API_SETUP.md` - Detailed setup guide
- `TESTING_GUIDE.md` - Complete feature testing guide
- `verify-api-key.js` - Automated verification script
- `setup-api-key.sh` - Automated setup script

## Next Steps

1. Read `TESTING_GUIDE.md` for comprehensive feature testing
2. Check `GEMINI_API_SETUP.md` for troubleshooting
3. Monitor API usage at https://aistudio.google.com
4. Review security section in `GEMINI_API_SETUP.md`

## Need Help?

1. Run verification: `node verify-api-key.js`
2. Check detailed docs: `GEMINI_API_SETUP.md`
3. Review testing guide: `TESTING_GUIDE.md`
4. Check browser console for errors
5. Verify API key at https://aistudio.google.com/apikey

## Security Reminder

- ✅ `.env.local` is in `.gitignore` (already done)
- ✅ Never commit your API key to Git
- ✅ Never share your API key publicly
- ✅ Monitor usage at https://aistudio.google.com
- ✅ Set up billing alerts if using paid tier

---

**You're all set! Start the server and test the features.**
