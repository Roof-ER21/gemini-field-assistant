/**
 * Multi-Provider AI Service
 * Supports: Groq, Together AI, Ollama (local), Hugging Face, and Gemini (fallback)
 * Smart routing based on task type and availability
 */
const PROVIDERS = {
    groq: {
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        costPerToken: 0.00000059, // $0.59 per 1M tokens
        speedRank: 1, // Fastest
    },
    together: {
        name: 'Together AI',
        baseUrl: 'https://api.together.xyz/v1',
        defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        costPerToken: 0.00000088, // $0.88 per 1M tokens
        speedRank: 2,
    },
    ollama: {
        name: 'Ollama (Local)',
        baseUrl: 'http://localhost:11434/api',
        defaultModel: 'qwen2.5-coder:latest',
        costPerToken: 0, // Free! Runs locally
        speedRank: 3,
    },
    huggingface: {
        name: 'Hugging Face',
        baseUrl: 'https://api-inference.huggingface.co/models',
        defaultModel: 'meta-llama/Llama-3.2-3B-Instruct',
        costPerToken: 0, // Free tier available
        speedRank: 4,
    },
    gemini: {
        name: 'Google Gemini',
        baseUrl: '', // Uses @google/genai SDK
        defaultModel: 'gemini-2.0-flash-exp',
        costPerToken: 0.00000075, // $0.075 per 1M tokens (input)
        speedRank: 2,
    },
};
/**
 * Smart Provider Selector
 * Chooses the best provider based on task type, cost, and availability
 */
export class MultiProviderAI {
    preferredOrder = ['ollama', 'groq', 'together', 'huggingface', 'gemini'];
    constructor() {
        // Check environment and adjust order
        if (!this.isOllamaAvailable()) {
            this.preferredOrder = this.preferredOrder.filter(p => p !== 'ollama');
        }
    }
    /**
     * Generate AI response with automatic provider selection
     */
    async generate(messages, options) {
        const provider = options?.provider || await this.selectBestProvider();
        try {
            switch (provider) {
                case 'ollama':
                    return await this.generateOllama(messages, options);
                case 'groq':
                    return await this.generateGroq(messages, options);
                case 'together':
                    return await this.generateTogether(messages, options);
                case 'huggingface':
                    return await this.generateHuggingFace(messages, options);
                case 'gemini':
                    return await this.generateGemini(messages, options);
                default:
                    throw new Error(`Unknown provider: ${provider}`);
            }
        }
        catch (error) {
            console.error(`Error with ${provider}:`, error);
            // Fallback to next available provider
            return await this.generateWithFallback(messages, provider, options);
        }
    }
    /**
     * Ollama (Local) - FREE, FAST, PRIVATE
     */
    async generateOllama(messages, options) {
        const model = import.meta.env.VITE_OLLAMA_MODEL || PROVIDERS.ollama.defaultModel;
        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                stream: false,
                options: {
                    temperature: options?.temperature || 0.7,
                    num_predict: options?.maxTokens || 2048,
                },
            }),
        });
        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.statusText}`);
        }
        const data = await response.json();
        return {
            content: data.message.content,
            provider: 'Ollama (Local)',
            model,
            tokensUsed: data.eval_count || 0,
        };
    }
    /**
     * Groq - FASTEST COMMERCIAL API
     */
    async generateGroq(messages, options) {
        const apiKey = import.meta.env.VITE_GROQ_API_KEY;
        if (!apiKey)
            throw new Error('GROQ_API_KEY not set');
        const model = import.meta.env.VITE_GROQ_MODEL || PROVIDERS.groq.defaultModel;
        const response = await fetch(`${PROVIDERS.groq.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: options?.temperature || 0.7,
                max_tokens: options?.maxTokens || 2048,
            }),
        });
        if (!response.ok) {
            throw new Error(`Groq API error: ${response.statusText}`);
        }
        const data = await response.json();
        return {
            content: data.choices[0].message.content,
            provider: 'Groq',
            model,
            tokensUsed: data.usage?.total_tokens,
        };
    }
    /**
     * Together AI - GREAT MODELS, LOW COST
     */
    async generateTogether(messages, options) {
        const apiKey = import.meta.env.VITE_TOGETHER_API_KEY;
        if (!apiKey)
            throw new Error('TOGETHER_API_KEY not set');
        const model = import.meta.env.VITE_TOGETHER_MODEL || PROVIDERS.together.defaultModel;
        const response = await fetch(`${PROVIDERS.together.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: options?.temperature || 0.7,
                max_tokens: options?.maxTokens || 2048,
            }),
        });
        if (!response.ok) {
            throw new Error(`Together AI error: ${response.statusText}`);
        }
        const data = await response.json();
        return {
            content: data.choices[0].message.content,
            provider: 'Together AI',
            model,
            tokensUsed: data.usage?.total_tokens,
        };
    }
    /**
     * Hugging Face - FREE TIER AVAILABLE
     */
    async generateHuggingFace(messages, options) {
        const apiKey = import.meta.env.VITE_HF_API_KEY;
        if (!apiKey)
            throw new Error('HF_API_KEY not set');
        const model = import.meta.env.VITE_HF_MODEL || PROVIDERS.huggingface.defaultModel;
        // Convert messages to prompt
        const prompt = messages.map(m => {
            if (m.role === 'system')
                return `System: ${m.content}`;
            if (m.role === 'user')
                return `User: ${m.content}`;
            return `Assistant: ${m.content}`;
        }).join('\n\n') + '\n\nAssistant:';
        const response = await fetch(`${PROVIDERS.huggingface.baseUrl}/${model}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    temperature: options?.temperature || 0.7,
                    max_new_tokens: options?.maxTokens || 2048,
                    return_full_text: false,
                },
            }),
        });
        if (!response.ok) {
            throw new Error(`Hugging Face error: ${response.statusText}`);
        }
        const data = await response.json();
        const content = Array.isArray(data) ? data[0].generated_text : data.generated_text;
        return {
            content,
            provider: 'Hugging Face',
            model,
        };
    }
    /**
     * Gemini - FALLBACK OPTION
     */
    async generateGemini(messages, options) {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
            throw new Error('GEMINI_API_KEY not set');
        }
        // Use existing Gemini implementation
        const { GoogleGenerativeAI } = await import('@google/genai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: import.meta.env.VITE_GEMINI_MODEL || PROVIDERS.gemini.defaultModel
        });
        // Convert messages to Gemini format
        const contents = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }],
        }));
        const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
        const chat = model.startChat({
            history: contents.slice(0, -1),
            systemInstruction,
        });
        const result = await chat.sendMessage(contents[contents.length - 1].parts[0].text);
        const response = await result.response;
        return {
            content: response.text(),
            provider: 'Google Gemini',
            model: PROVIDERS.gemini.defaultModel,
        };
    }
    /**
     * Fallback mechanism
     */
    async generateWithFallback(messages, failedProvider, options) {
        const remainingProviders = this.preferredOrder.filter(p => p !== failedProvider);
        for (const provider of remainingProviders) {
            try {
                return await this.generate(messages, { ...options, provider });
            }
            catch (error) {
                console.error(`Fallback ${provider} failed:`, error);
                continue;
            }
        }
        throw new Error('All AI providers failed');
    }
    /**
     * Select best provider based on availability and cost
     */
    async selectBestProvider() {
        // 1. Try Ollama first (free, local, private)
        if (await this.isOllamaAvailable()) {
            return 'ollama';
        }
        // 2. Try Groq (fastest commercial)
        if (import.meta.env.VITE_GROQ_API_KEY) {
            return 'groq';
        }
        // 3. Try Together AI (good balance)
        if (import.meta.env.VITE_TOGETHER_API_KEY) {
            return 'together';
        }
        // 4. Try Hugging Face (free tier)
        if (import.meta.env.VITE_HF_API_KEY) {
            return 'huggingface';
        }
        // 5. Fallback to Gemini
        if (import.meta.env.VITE_GEMINI_API_KEY) {
            return 'gemini';
        }
        throw new Error('No AI providers configured');
    }
    /**
     * Check if Ollama is available
     * Note: Only checks in local development to prevent CORS errors in production
     */
    async isOllamaAvailable() {
        // Don't check for Ollama in production (prevents CORS errors)
        if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            return false;
        }
        try {
            const response = await fetch('http://localhost:11434/api/tags', {
                method: 'GET',
                signal: AbortSignal.timeout(1000),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Get available providers
     */
    async getAvailableProviders() {
        const available = [];
        if (await this.isOllamaAvailable())
            available.push('ollama');
        if (import.meta.env.VITE_GROQ_API_KEY)
            available.push('groq');
        if (import.meta.env.VITE_TOGETHER_API_KEY)
            available.push('together');
        if (import.meta.env.VITE_HF_API_KEY)
            available.push('huggingface');
        if (import.meta.env.VITE_GEMINI_API_KEY && import.meta.env.VITE_GEMINI_API_KEY !== 'PLACEHOLDER_API_KEY') {
            available.push('gemini');
        }
        return available;
    }
    /**
     * Get provider info
     */
    getProviderInfo(provider) {
        return PROVIDERS[provider];
    }
}
// Export singleton instance
export const multiAI = new MultiProviderAI();
