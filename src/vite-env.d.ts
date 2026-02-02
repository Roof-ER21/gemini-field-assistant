/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_GROQ_API_KEY: string;
  readonly VITE_TOGETHER_API_KEY: string;
  readonly VITE_HF_API_KEY: string;
  readonly VITE_API_URL: string;
  readonly VITE_TTS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
