import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
    // Load env from files (for local dev) and merge with process.env (for CI/Railway)
    const fileEnv = loadEnv(mode, process.cwd(), '');
    const get = (key: string) => process.env[key] ?? fileEnv[key];
    return {
      server: {
        port: 5174,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: `http://localhost:${process.env.PORT || 3001}`,
            changeOrigin: true,
          },
          '/ws': {
            target: `ws://localhost:${process.env.PORT || 3001}`,
            ws: true,
          },
          '/socket.io': {
            target: `ws://localhost:${process.env.PORT || 3001}`,
            ws: true,
          },
        },
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
      // Explicit public allowlist: VITE_* provider secrets must never enter import.meta.env.
      envPrefix: ['VITE_APP_', 'VITE_PUBLIC_'],
      define: {
        // Preserve existing non-secret browser settings with exact names.
        ...Object.fromEntries([
          'API_URL', 'TTS_API_URL', 'MAPBOX_TOKEN', 'ADMIN_EMAIL',
          'ACTIVITY_LOGGING_ENABLED', 'EMAIL_NOTIFICATIONS_ENABLED',
          'GEMINI_MODEL', 'GROQ_MODEL', 'HF_MODEL', 'OLLAMA_MODEL', 'TOGETHER_MODEL',
          'RAG_ENABLED', 'RAG_TOP_K', 'TRANSCRIPTION_MAX_DURATION', 'TRANSCRIPTION_WARNING_THRESHOLD',
        ].map(key => [`import.meta.env.VITE_${key}`, JSON.stringify(get(`VITE_${key}`))])),
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
          input: {
            main: resolve(__dirname, 'index.html'),
            profile: resolve(__dirname, 'profile.html'),
            present: resolve(__dirname, 'present.html'),
          },
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
