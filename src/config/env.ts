/**
 * Environment Configuration Helper
 * Works in both development (VITE_ prefix) and production (Railway vars)
 */

const getEnvVar = (key: string): string | undefined => {
  // Try Railway/server environment variable first (production)
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }

  // Fallback to Vite environment variable (development)
  const viteKey = `VITE_${key}`;
  return import.meta.env[viteKey];
};

export const env = {
  // API Keys
  GEMINI_API_KEY: getEnvVar('GEMINI_API_KEY') || '',
  GROQ_API_KEY: getEnvVar('GROQ_API_KEY') || '',
  TOGETHER_API_KEY: getEnvVar('TOGETHER_API_KEY') || '',
  HF_API_KEY: getEnvVar('HUGGINGFACE_API_KEY') || getEnvVar('HF_API_KEY') || '',
  OPENAI_API_KEY: getEnvVar('OPENAI_API_KEY') || '',

  // Feature Flags
  RAG_ENABLED: getEnvVar('RAG_ENABLED') === 'true',
  RAG_TOP_K: parseInt(getEnvVar('RAG_TOP_K') || '5'),

  // Transcription Limits (cost control)
  TRANSCRIPTION_MAX_DURATION: parseInt(getEnvVar('TRANSCRIPTION_MAX_DURATION') || '180'), // 3 minutes default
  TRANSCRIPTION_WARNING_THRESHOLD: parseInt(getEnvVar('TRANSCRIPTION_WARNING_THRESHOLD') || '150'), // 2:30 warning

  // Environment
  IS_PRODUCTION: getEnvVar('RAILWAY_ENVIRONMENT') === 'production' || import.meta.env.PROD,
  IS_DEVELOPMENT: !import.meta.env.PROD,

  // Logging
  get isDevelopment() {
    return this.IS_DEVELOPMENT;
  },

  get isProduction() {
    return this.IS_PRODUCTION;
  },

  // Validation
  validate() {
    const missing: string[] = [];

    if (!this.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
    if (!this.GROQ_API_KEY) missing.push('GROQ_API_KEY');
    if (!this.TOGETHER_API_KEY) missing.push('TOGETHER_API_KEY');

    if (missing.length > 0) {
      console.warn('⚠️ Missing environment variables:', missing.join(', '));

      if (this.isProduction) {
        console.error('🔴 Critical: Production deployment missing required API keys!');
        console.info('➡ Set VITE_GROQ_API_KEY, VITE_TOGETHER_API_KEY, VITE_GEMINI_API_KEY (and optional VITE_HF_API_KEY) in Railway, then redeploy.');
        console.info('ℹ Provider status endpoint: /api/providers/status');
      } else {
        console.info('ℹ Dev tip: add keys to .env.local using VITE_* names.');
      }
    }

    return missing.length === 0;
  }
};

// Validate on load
if (env.isProduction) {
  env.validate();
}
