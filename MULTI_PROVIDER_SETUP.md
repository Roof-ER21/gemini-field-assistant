# 🚀 Multi-Provider AI Setup Guide

## Overview

Your S21 Field Assistant now supports **5 AI providers** to save money and provide better performance:

1. **Ollama (Local)** - FREE, FAST, PRIVATE (recommended!)
2. **Groq** - FASTEST commercial API ($0.59/1M tokens)
3. **Together AI** - Great balance ($0.88/1M tokens)
4. **Hugging Face** - FREE tier available
5. **Gemini** - Fallback option ($0.75/1M tokens)

## Smart Provider Selection

The system automatically chooses the best provider based on:
- ✅ Availability (which APIs you have keys for)
- ✅ Cost (prefers free options)
- ✅ Speed (Ollama > Groq > Together > HF > Gemini)
- ✅ Fallback (if one fails, tries the next)

---

## Option 1: Ollama (Local AI) - **RECOMMENDED**

### Why Ollama?
- ✅ **100% FREE** - No API costs ever
- ✅ **FAST** - Runs on your machine
- ✅ **PRIVATE** - Your data never leaves your computer
- ✅ **OFFLINE** - Works without internet
- ✅ **NO API KEYS** - Just install and use

### Install Ollama (5 minutes)

#### macOS
```bash
# Download and install from website
open https://ollama.com/download

# OR use Homebrew
brew install ollama
```

#### Linux
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

#### Windows
```bash
# Download from https://ollama.com/download
```

### Pull a Model
```bash
# Recommended: Qwen 2.5 Coder (best for S21)
ollama pull qwen2.5-coder:latest

# Alternative options:
ollama pull llama3.2:latest        # Fast, 3B params
ollama pull deepseek-r1:8b         # Advanced reasoning
ollama pull gemma2:latest          # Fast prototyping
```

### Test It
```bash
# Check if Ollama is running
ollama list

# Test a model
ollama run qwen2.5-coder "Hello, are you working?"
```

### Configure S21
No configuration needed! S21 will automatically detect and use Ollama if it's running.

---

## Option 2: Groq API - **FASTEST CLOUD**

### Why Groq?
- ✅ **BLAZING FAST** - 500+ tokens/second
- ✅ **CHEAP** - $0.59 per 1M tokens
- ✅ **POWERFUL** - Llama 3.3 70B model
- ✅ **FREE TIER** - Limited free usage

### Setup (2 minutes)

1. **Get API Key**
   ```bash
   open https://console.groq.com/keys
   ```

2. **Add to .env.local**
   ```bash
   cd /Users/a21/Desktop/gemini-field-assistant
   echo 'VITE_GROQ_API_KEY=gsk_your_key_here' >> .env.local
   ```

3. **Restart Dev Server**
   ```bash
   npm run dev
   ```

### Models Available
- `llama-3.3-70b-versatile` (default) - Best overall
- `llama-3.1-8b-instant` - Fastest
- `mixtral-8x7b-32768` - Long context

---

## Option 3: Together AI - **BEST BALANCE**

### Why Together AI?
- ✅ **GREAT BALANCE** - Cost + performance
- ✅ **MANY MODELS** - 50+ options
- ✅ **GOOD PRICING** - $0.88 per 1M tokens
- ✅ **$25 FREE CREDIT** - For new users

### Setup (2 minutes)

1. **Get API Key**
   ```bash
   open https://api.together.xyz/settings/api-keys
   ```

2. **Add to .env.local**
   ```bash
   echo 'VITE_TOGETHER_API_KEY=your_key_here' >> .env.local
   ```

3. **Restart Dev Server**

### Models Available
- `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo` (default)
- `meta-llama/Llama-3.2-90B-Vision-Instruct` - With vision
- `Qwen/QwQ-32B-Preview` - Advanced reasoning

---

## Option 4: Hugging Face - **FREE TIER**

### Why Hugging Face?
- ✅ **FREE TIER** - Generous limits
- ✅ **MANY MODELS** - Thousands available
- ✅ **COMMUNITY** - Active development
- ✅ **OPEN SOURCE** - Transparent

### Setup (2 minutes)

1. **Get API Key**
   ```bash
   open https://huggingface.co/settings/tokens
   ```

2. **Add to .env.local**
   ```bash
   echo 'VITE_HF_API_KEY=hf_your_key_here' >> .env.local
   ```

3. **Restart Dev Server**

### Models Available
- `meta-llama/Llama-3.2-3B-Instruct` (default) - Fast
- `google/gemma-2-9b-it` - Google's model
- `Qwen/Qwen2.5-7B-Instruct` - Alibaba's model

---

## Option 5: Google Gemini - **FALLBACK**

### Setup
Already configured! Just replace `PLACEHOLDER_API_KEY` in `.env.local`:

```bash
# Get key from
open https://aistudio.google.com/app/apikey

# Update .env.local
VITE_GEMINI_API_KEY=your_actual_key_here
```

---

## Quick Start Guide

### Fastest Setup (1 minute)
```bash
# Install Ollama
brew install ollama

# Pull model
ollama pull qwen2.5-coder

# Done! S21 will use it automatically
npm run dev
```

### Cost-Conscious Setup (3 minutes)
```bash
# 1. Install Ollama (free, local)
ollama pull qwen2.5-coder

# 2. Add Groq for when you need cloud (free tier)
echo 'VITE_GROQ_API_KEY=gsk_your_key' >> .env.local

# 3. Add HF as backup (free tier)
echo 'VITE_HF_API_KEY=hf_your_key' >> .env.local

npm run dev
```

### Maximum Power Setup (5 minutes)
```bash
# All providers for maximum reliability + fallback
ollama pull qwen2.5-coder
echo 'VITE_GROQ_API_KEY=gsk_...' >> .env.local
echo 'VITE_TOGETHER_API_KEY=...' >> .env.local
echo 'VITE_HF_API_KEY=hf_...' >> .env.local
echo 'VITE_GEMINI_API_KEY=...' >> .env.local

npm run dev
```

---

## Using the System

### Chat Interface
The chat will show which provider is being used:
```
🤖 Powered by Ollama (Local)
```

### Provider Selection Priority
1. **Ollama** (if running) - Uses local AI
2. **Groq** (if key exists) - Cloud fallback
3. **Together AI** (if key exists) - Alternative cloud
4. **Hugging Face** (if key exists) - Free tier
5. **Gemini** (if key exists) - Final fallback

### Cost Comparison (1M tokens)
| Provider | Cost | Speed Rank | Privacy |
|----------|------|------------|---------|
| Ollama | $0.00 | ⚡⚡⚡⚡⚡ (1) | 🔒 100% |
| Groq | $0.59 | ⚡⚡⚡⚡ (2) | ☁️ Cloud |
| Together | $0.88 | ⚡⚡⚡ (3) | ☁️ Cloud |
| HF | $0.00* | ⚡⚡ (4) | ☁️ Cloud |
| Gemini | $0.75 | ⚡⚡⚡ (2) | ☁️ Cloud |

*Free tier has rate limits

---

## Troubleshooting

### "No AI providers configured"
**Solution**: Add at least one API key or install Ollama

### "Ollama not available"
```bash
# Check if Ollama is running
ollama list

# Start Ollama service
ollama serve

# Pull a model if needed
ollama pull qwen2.5-coder
```

### "GROQ_API_KEY not set"
**Solution**: Add `VITE_GROQ_API_KEY=your_key` to `.env.local`

### "All AI providers failed"
**Solutions**:
1. Check your API keys are correct
2. Verify internet connection
3. Install Ollama for offline usage
4. Check provider status pages

---

## Advanced Configuration

### Override Default Models

Edit `.env.local`:
```bash
# Use different models
VITE_GROQ_MODEL=llama-3.1-8b-instant
VITE_TOGETHER_MODEL=meta-llama/Llama-3.2-90B-Vision-Instruct
VITE_HF_MODEL=google/gemma-2-9b-it
VITE_OLLAMA_MODEL=deepseek-r1:8b
VITE_GEMINI_MODEL=gemini-2.0-flash-exp
```

### Force Specific Provider

In `components/ChatPanel.tsx`:
```typescript
const response = await multiAI.generate(conversationMessages, {
  provider: 'groq' // Force Groq
});
```

---

## Recommended Setup

### For Sales Reps (Best Experience)
```bash
# Install Ollama for fast, private, offline AI
ollama pull qwen2.5-coder

# Add Groq for when you need cloud
VITE_GROQ_API_KEY=your_key
```

### For Managers (Cost Optimization)
```bash
# Free options only
ollama pull qwen2.5-coder    # Local (free)
VITE_HF_API_KEY=your_key     # Cloud backup (free tier)
```

### For Developers (Maximum Reliability)
```bash
# All providers for testing and fallback
ollama pull qwen2.5-coder
VITE_GROQ_API_KEY=...
VITE_TOGETHER_API_KEY=...
VITE_HF_API_KEY=...
VITE_GEMINI_API_KEY=...
```

---

## FAQ

**Q: Which provider should I use?**
A: Install Ollama first (free, fast, private). Add Groq as backup (cheap, fast).

**Q: Do I need all 5 providers?**
A: No! Just Ollama is enough. More providers = better fallback.

**Q: Will it cost me money?**
A: Ollama is 100% free. Cloud providers have free tiers or cheap pricing.

**Q: Can I use this offline?**
A: Yes! Ollama works completely offline.

**Q: Which is fastest?**
A: Groq for cloud, Ollama for local.

**Q: Which is cheapest?**
A: Ollama (free) > HF (free tier) > Groq ($0.59/1M) > Gemini ($0.75/1M) > Together ($0.88/1M)

---

## Resources

- **Ollama**: https://ollama.com
- **Groq**: https://console.groq.com
- **Together AI**: https://together.xyz
- **Hugging Face**: https://huggingface.co
- **Gemini**: https://aistudio.google.com

---

**🎉 You now have a powerful, cost-effective, multi-provider AI system!**

**Next Steps:**
1. Install Ollama (5 minutes)
2. Test the chat interface
3. Add cloud providers as needed
4. Save money while getting better performance!
