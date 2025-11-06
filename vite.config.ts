import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
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
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
        // Expose all VITE_ prefixed env vars for multiProviderAI
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        'import.meta.env.VITE_GROQ_API_KEY': JSON.stringify(env.VITE_GROQ_API_KEY),
        'import.meta.env.VITE_TOGETHER_API_KEY': JSON.stringify(env.VITE_TOGETHER_API_KEY),
        'import.meta.env.VITE_HF_API_KEY': JSON.stringify(env.VITE_HF_API_KEY),
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
