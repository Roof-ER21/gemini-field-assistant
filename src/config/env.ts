/** Public browser configuration. Provider credentials live only on the server. */
export const env = {
  // Retained for legacy non-browser provider methods; never populated in the client.
  GEMINI_API_KEY: '', GROQ_API_KEY: '', TOGETHER_API_KEY: '', HF_API_KEY: '', OPENAI_API_KEY: '',
  RAG_ENABLED: import.meta.env.VITE_RAG_ENABLED === 'true',
  RAG_TOP_K: parseInt(import.meta.env.VITE_RAG_TOP_K || '5'),
  TRANSCRIPTION_MAX_DURATION: parseInt(import.meta.env.VITE_TRANSCRIPTION_MAX_DURATION || '180'),
  TRANSCRIPTION_WARNING_THRESHOLD: parseInt(import.meta.env.VITE_TRANSCRIPTION_WARNING_THRESHOLD || '150'),
  IS_PRODUCTION: import.meta.env.PROD,
  IS_DEVELOPMENT: import.meta.env.DEV,
  get isDevelopment() { return this.IS_DEVELOPMENT; },
  get isProduction() { return this.IS_PRODUCTION; },
};
