import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load env from files (for local dev) and merge with process.env (for CI/Railway)
    const fileEnv = loadEnv(mode, process.cwd(), '');
    const get = (key: string) => process.env[key] ?? fileEnv[key];
    return {
      server: {
        port: 5174,
        host: '0.0.0.0',
      },
      preview: {
        host: '0.0.0.0',
        port: 4173,
        strictPort: false,
        allowedHosts: [
          'sa21.up.railway.app',
          's21a24.up.railway.app',
          'jubilant-encouragement-production.up.railway.app',
          '.railway.app',
        ]
      },
      plugins: [react()],
      define: {
        // Expose provider keys via process.env for src/config/env.ts
        // Prefer CI/Railway environment over file-based env
        'process.env.GEMINI_API_KEY': JSON.stringify(get('VITE_GEMINI_API_KEY') || get('GEMINI_API_KEY')),
        'process.env.GROQ_API_KEY': JSON.stringify(get('VITE_GROQ_API_KEY') || get('GROQ_API_KEY')),
        'process.env.TOGETHER_API_KEY': JSON.stringify(get('VITE_TOGETHER_API_KEY') || get('TOGETHER_API_KEY')),
        'process.env.HUGGINGFACE_API_KEY': JSON.stringify(get('VITE_HF_API_KEY') || get('HUGGINGFACE_API_KEY') || get('HF_API_KEY')),
        'process.env.HF_API_KEY': JSON.stringify(get('VITE_HF_API_KEY') || get('HUGGINGFACE_API_KEY') || get('HF_API_KEY')),
        'process.env.OPENAI_API_KEY': JSON.stringify(get('VITE_OPENAI_API_KEY') || get('OPENAI_API_KEY')),
        'process.env.RAILWAY_ENVIRONMENT': JSON.stringify(get('RAILWAY_ENVIRONMENT') || process.env.NODE_ENV || 'production'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        include: ['recharts', 'victory-vendor/d3-shape']
      },
      build: {
        rollupOptions: {
          onwarn(warning, warn) {
            if (warning.code === 'UNRESOLVED_IMPORT' && warning.message.includes('victory-vendor')) {
              return;
            }
            warn(warning);
          }
        }
      }
    };
});
// Force rebuild with VITE environment variables
