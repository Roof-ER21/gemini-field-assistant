# Susan AI - Critical Fixes Required

## Issue 1: Gemini API Is Broken

### Location
- `services/multiProviderAI.ts` lines 290-303
- `components/LivePanel.tsx` lines 364-377

### Problem
Using non-existent `genAI.chats.create()` method that doesn't exist in GoogleGenAI SDK.

### Current Broken Code (multiProviderAI.ts:290-303)
```typescript
const chat = genAI.chats.create({
  model: modelName,
  history: contents.slice(0, -1),
  systemInstruction,
});

const result = await chat.sendMessage(contents[contents.length - 1].parts[0].text);
```

### Correct Fix
```typescript
const result = await genAI.models.generateContent({
  model: modelName,
  contents: [{
    parts: [{ text: systemInstruction + '\n\n' + messages[messages.length - 1].content }],
    role: 'user'
  }]
});

return {
  content: result.text,
  provider: 'Google Gemini',
  model: modelName,
};
```

### Live Panel Fix (LivePanel.tsx:364-377)
Replace entire Gemini API call section with:
```typescript
const messages: AIMessage[] = [
  { role: 'system' as const, content: prompt },
  { role: 'user' as const, content: 'Audio transcription above. Respond.' }
];

const response = await multiAI.generate(messages, {
  temperature: 0.7,
  maxTokens: 150
});

// Parse JSON response
const jsonMatch = response.content.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  throw new Error('Failed to parse AI response');
}

const data = JSON.parse(jsonMatch[0]);
```

---

## Issue 2: LivePanel Ignores MultiProviderAI System

### Location
`components/LivePanel.tsx` lines 287-365

### Problem
Hardcodes Gemini API instead of using intelligent `multiProviderAI.generate()` system with fallbacks.

### Current Broken Code
```typescript
const apiKey = env.GEMINI_API_KEY || (process.env.GEMINI_API_KEY as string);
if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
  throw new Error('Gemini API key not configured...');
}

let genAI: GoogleGenAI;
try {
  genAI = new GoogleGenAI({ apiKey });
} catch (error) {
  throw new Error('Failed to initialize Gemini AI...');
}

// Then uses genAI directly - ignores multiAI system
```

### Correct Fix
```typescript
import { multiAI } from '../services/multiProviderAI';
import { SYSTEM_PROMPT } from '../config/s21Personality';

const conversationContext = messages.slice(-5).map(m =>
  `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
).join('\n');

const systemPrompt = `You are S21 (Susan)...
[Full S21 system prompt here - keep existing prompt]`;

const messages: AIMessage[] = [
  { role: 'system' as const, content: systemPrompt },
  { role: 'user' as const, content: `Recent conversation:\n${conversationContext}\n\nRespond to the user's audio input.` }
];

try {
  const response = await multiAI.generate(messages, { 
    temperature: 0.7, 
    maxTokens: 150 
  });

  // Parse response and extract transcription
  const jsonMatch = response.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse response');
  }

  const data = JSON.parse(jsonMatch[0]);
  const userMessage = addMessage('user', data.transcription, true);
  const aiMessage = addMessage('assistant', data.response);
  
  setSessionMessageCount(prev => prev + 1);
  
  if (!isMuted) {
    speakText(data.response);
  }
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error('Failed to process audio:', errorMsg);
  
  // Better error message
  let userMessage = 'Sorry, I had trouble processing that.';
  if (errorMsg.includes('provider')) {
    userMessage += ' (No AI providers available - check configuration)';
  } else if (errorMsg.includes('network')) {
    userMessage += ' (Network error - please try again)';
  }
  
  addMessage('assistant', userMessage);
}
```

---

## Issue 3: No Error Context When All Providers Fail

### Location
`services/multiProviderAI.ts` lines 309-326

### Problem
When all providers fail, error message is generic and doesn't help diagnose the issue.

### Current Code
```typescript
for (const provider of remainingProviders) {
  try {
    return await this.generate(messages, { ...options, provider });
  } catch (error) {
    console.error(`Fallback ${provider} failed:`, error);
    continue; // Just moves to next without tracking
  }
}

throw new Error('All AI providers failed');
```

### Correct Fix
```typescript
const errors: Record<string, string> = {};
const failedProviders: string[] = [];

for (const provider of remainingProviders) {
  try {
    const result = await this.generate(messages, { ...options, provider });
    return result;
  } catch (error) {
    failedProviders.push(provider);
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors[provider] = errorMsg;
    console.error(`Fallback ${provider} failed: ${errorMsg}`);
  }
}

// Build comprehensive error message
const errorDetails = failedProviders
  .map(p => `- ${p}: ${errors[p]?.substring(0, 100) || 'Unknown error'}`)
  .join('\n');

const finalError = `
All AI providers failed. Tried: ${failedProviders.join(', ')}

Details:
${errorDetails}

Troubleshooting:
1. Check API keys are configured (GROQ_API_KEY, TOGETHER_API_KEY, etc.)
2. Check network connectivity
3. Check if providers are experiencing outages
4. For local development, install Ollama: https://ollama.ai

Contact support if issue persists.
`;

throw new Error(finalError);
```

---

## Testing the Fixes

After applying fixes, test:

```bash
# Test Gemini provider with valid key
export GEMINI_API_KEY=your_key_here
npm run dev

# Test with missing key
unset GEMINI_API_KEY
# Should fallback gracefully

# Test LivePanel
# 1. Click "Start Talking" button
# 2. Speak something
# 3. Verify AI responds (should use multiAI, not just Gemini)

# Test error messages
# 1. Turn off all API keys
# 2. Send a message
# 3. Should see detailed error about which providers failed
```

---

## Priority

**Deploy within 24 hours** - These issues block core functionality:
1. Gemini API is completely broken
2. LivePanel has no fallback
3. Error messages are unhelpful
